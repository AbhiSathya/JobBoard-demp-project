# Job Board with AI-Powered Candidate Matching

A job board where Company Admins post and manage listings, and Candidates build a
profile, browse and filter jobs, and get AI-ranked job recommendations from a
plain-English description of what they want — with a score and a plain-English
explanation for every match.

## Main features

**Company Admin**
- Create, edit, and list job postings; toggle a job between Open and Closed
- Review applications per job, inspect the submitted candidate profile
- Move applications through Applied → Shortlisted / Rejected
- A dashboard of applications-per-job, skill distribution, and pipeline counts —
  computed live from the database, never hardcoded

**Candidate**
- Create and update a profile (skills, education, projects, preferences)
- Browse jobs with search, skill/location/experience filters that combine predictably
- Describe a desired role in plain English and get ranked, explained matches
- Apply to a job with the saved profile; duplicate and closed-job applications are rejected

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI + Pydantic v2 | Request/response validation and OpenAPI docs come from one set of type declarations |
| Database | SQLite + SQLAlchemy 2.0 + Alembic | SQLite's driver ships with Python — identical setup on Windows and Ubuntu, nothing to install. Alembic keeps a path open to Postgres later |
| Auth | PyJWT + `hashlib.scrypt` | Real JWT auth without a native dependency — scrypt is stdlib, avoiding the bcrypt/passlib wheel-build problems that are the most common Windows setup failure |
| AI provider | OpenRouter (`httpx`), free tier | OpenAI-compatible API; a 40-line client with a hard timeout beats an SDK for one endpoint |
| Frontend | React + TypeScript + Vite | Type safety across the API boundary; fast dev loop, small production build |
| Server state | TanStack Query | Caching, loading/error state, and cache invalidation without hand-rolling all three |
| Forms | React Hook Form + Zod | Schema-driven validation that mirrors the backend's Pydantic schemas |
| Styling | Tailwind CSS v4 | One spacing/type/color scale enforced across every page |
| Charts | Recharts | The dashboard's two bar charts |

No Docker, no Redis, no ORM beyond SQLAlchemy, no component library, no LLM SDK —
each was left out because nothing in this project's scope needed it.

## Architecture

```
React SPA (Vite, TS)                     FastAPI
┌──────────────────────────┐             ┌────────────────────────────────┐
│ pages/  candidate, admin │             │ api/       routers (thin)       │
│ components/ ui, domain   │             │ schemas/   Pydantic I/O          │
│ lib/api.ts  fetch client │   HTTP/JSON │ services/  business rules        │
│ hooks/      TanStack Q   │ ──────────► │ matching/  intent, score, explain│
│ auth ctx (JWT in localStorage) │       │ models/    SQLAlchemy 2.0         │
└──────────────────────────┘             │ core/      config, errors, deps, logging │
                                          └───────────────┬──────────────────┘
                                                ┌──────────┴─────────┐
                                             SQLite               OpenRouter
                                          (SQLAlchemy           (optional; a
                                           + Alembic)          deterministic
                                                                fallback runs
                                                                without it)
```

Routers only do auth, validation, and call one service method. Services own all
business rules and database access. `app/matching/` (intent extraction, scoring,
explanation) is pure Python — no database, no network — which is what makes the
ranking logic unit-testable rather than buried in a prompt.

## Repository structure

```
backend/
  app/
    api/        FastAPI routers — one file per resource
    core/       config, db session, JWT/password security, error handlers, logging
    matching/   intent extraction, scoring, explanation — pure, no I/O
    models/     SQLAlchemy models
    schemas/    Pydantic request/response schemas
    services/   business logic, called by routers
  alembic/      migrations
  scripts/seed.py
  tests/        pytest suite (83 tests)
frontend/
  src/
    components/ ui/ (Button, Field, Badge, Feedback…), layout/, JobCard
    hooks/      TanStack Query hooks, one file per resource
    lib/        api client, auth context
    pages/      candidate/, admin/, Login, Register
    types/      TypeScript types mirroring the backend schemas
writeup/        the implementation plan this project was built from
```

## Data model

- **User** — email, password hash, role (`admin` | `candidate`), `company_name` (admin only)
- **CandidateProfile** — 1:1 with a candidate User. Skills, preferred location/role
  type, domain interests, plus `education` and `projects` as **JSON columns**, not
  separate tables — they are only ever read as part of the whole profile and never
  queried independently. (If that changes — e.g. "find candidates with a CS degree" —
  promote them to real tables; the JSON shape maps directly onto that schema.)
- **Job** — owned by an admin User. Title, description, required skills, experience
  level, location, employment type, domain, status (`open` | `closed`)
- **Application** — links a Job and a candidate User. `UNIQUE(job_id, candidate_id)`
  at the database level prevents duplicates even under concurrent requests. Stores a
  **snapshot** of the candidate's profile at submit time, so a later profile edit
  doesn't rewrite what the admin actually reviewed.

## AI-matching design

**The problem the brief calls out directly: don't put essential ranking logic
inside an untestable prompt.** So the pipeline splits into a part that's allowed to
be fuzzy and a part that must be deterministic:

```
query ──► extract_intent() ──► MatchIntent{roles, skills, experience, locations, domains, type}
            ├─ LLM (OpenRouter, strict JSON, 8s timeout, Pydantic-validated)
            └─ fallback: deterministic keyword extractor (vocabulary built from live job data)
                                    │
open jobs ─► score_job(intent, profile, job) → ScoreBreakdown   [pure Python, unit-tested]
                                    │
                          rank, band, explain(breakdown)   [built from the breakdown's own facts]
```

- **Intent extraction** (`app/matching/intent.py`, `provider.py`) turns the free-text
  query into structured fields. If `OPENROUTER_API_KEY` is set, it tries the LLM first
  (8s timeout); on *any* failure — no key, timeout, non-200, malformed JSON, or a
  response that fails schema validation — it falls back to a deterministic
  keyword/regex extractor built from the vocabulary of currently open jobs. This
  fallback is not a degraded mode kept around for emergencies: it's exercised by
  every test and is what runs the whole match pipeline when no key is configured.
- **Scoring** (`app/matching/score.py`) is a fixed weighted sum — no model, no
  randomness, fully deterministic and unit-tested:

  | Component | Weight | Rule |
  |---|---|---|
  | Skills | 40 | `matched / required`; a skill named in the query gets full credit, a skill only in the saved profile gets 0.6 credit |
  | Role / title | 20 | token overlap between the stated role and the job title |
  | Domain | 15 | exact match against the query's or profile's domain interests |
  | Experience | 10 | exact level = 1.0, one level off = 0.5, further = 0 |
  | Location | 10 | exact/contains/remote = 1.0; no location stated = neutral |
  | Employment type | 5 | exact match |

  Bands: **Strong** ≥ 70, **Good** 50–69, **Fair** 30–49. Jobs below 30 aren't ranked
  as real matches — if nothing clears 30, the response says so explicitly and returns
  the closest 3 jobs labeled as weak matches, rather than presenting a low-confidence
  guess as a genuine recommendation.
- **Explanations** (`app/matching/explain.py`) are built as sentences read directly off
  the score breakdown ("Matches 4 of 6 required skills (…). Healthcare domain matches
  your stated interest. Location differs: role is in Berlin.") — never generated by an
  LLM. This is what makes "avoid inventing skills or facts" a structural guarantee
  rather than a prompt instruction: there's no path from an explanation string back to
  anything that wasn't already a field on the breakdown.
- **What affects ranking:** the candidate's saved profile skills/experience/location/domain
  fill in whatever the query didn't state — a candidate who says "senior Python role"
  still gets domain and location credit from their profile. Only currently `open` jobs
  are ever scored.
- **Known limitations:** skill/domain matching is keyword-based (case-insensitive
  substring), not semantic — "JS" won't match "JavaScript" unless both exact
  strings appear in a job's skill list. Role-title overlap is a simple token match,
  not an understanding of job-title synonyms.
- **With more time/data:** replace the deterministic fallback's keyword matching with
  embedding similarity for skills/domains (still keeping the weighted-sum scorer as
  the ranking authority, since that's what stays explainable and testable); learn the
  component weights from real apply/hire outcomes instead of hand-set values.

## Assumptions

1. One admin account maps to one company (`company_name`, set at registration); an
   admin only sees and edits their own jobs. Candidates browse jobs from every company.
2. Auth is real JWT (scrypt-hashed passwords, 12h tokens) but intentionally minimal —
   no refresh tokens, no password reset, no email verification. This is a project-scope
   decision, not a production auth system; see Known limitations.
3. `education` / `projects` are JSON on the candidate profile, not separate tables — see
   Data model above for the reasoning and upgrade path.
4. An application freezes the candidate's profile at submit time (`profile_snapshot`).
5. AI matching only ever considers jobs with `status = open`.
6. Application pipeline: `applied → shortlisted → rejected`, or `applied → rejected`
   directly. `rejected` is terminal — any other transition is rejected with the
   allowed set named in the error.
7. No salary field — not in the brief, so not invented.

## Known limitations

- No refresh tokens / password reset / email verification.
- Matching is keyword/rule-based by default, augmented by an LLM only for parsing the
  query and only when a key is configured — see AI-matching design above.
- No pagination UI on the jobs list (the API supports `page`/`page_size`; the frontend
  currently renders one page).
- Frontend bundle is a single chunk (~227 KB gzipped) — fine at this app's size; would
  code-split before it grew much further.

## Future improvements

- Embedding-based semantic skill/domain matching
- Postgres + connection pooling for real concurrent load
- Refresh tokens, password reset, recruiter teams per company
- Interview scheduling and internal application notes
- Rate limiting and audit logging on write endpoints

---

## Setup

### Prerequisites

- **Python 3.11+** and **[uv](https://docs.astral.sh/uv/)** (or plain `pip` — see below)
- **Node.js 20+** and npm
- No Docker, no Postgres, no other services required — SQLite is a file.

Everything below works identically on Windows (PowerShell) and Ubuntu (bash); the
only difference is the virtualenv activation command, called out where it applies.

### 1. Backend

```bash
cd backend
uv venv .venv --python 3.12          # or: python -m venv .venv
```

Activate the virtualenv:
```bash
# Ubuntu / macOS
source .venv/bin/activate
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install dependencies:
```bash
uv pip install -e ".[dev]"
# or, without uv:
pip install -e ".[dev]"
```

Environment variables:
```bash
cp .env.example .env        # Ubuntu
copy .env.example .env      # Windows
```
Open `.env` and set `JWT_SECRET` to your own random string. `OPENROUTER_API_KEY` is
optional — leave it blank and AI matching runs entirely on the deterministic fallback
described above. Get a free key at https://openrouter.ai/keys if you want the LLM path.

Database — run the migration to create `jobboard.db`:
```bash
alembic upgrade head
```

Seed demo data (idempotent — safe to re-run any time, including right before a demo):
```bash
python -m scripts.seed
```
This creates 5 companies/admins, 18 jobs across 5 domains, 6 candidates with full
profiles, and 13 applications spread across the pipeline. All seeded accounts use the
password `password123` (see the seed script for the email list, e.g.
`admin@acmehealth.com`, `jordan.lee@example.com`).

Start the API:
```bash
uvicorn app.main:app --reload --port 8000
```

API docs: **http://localhost:8000/docs** (Swagger UI, auto-generated from the
Pydantic schemas) — also available at `/redoc`.

### 2. Frontend

In a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. The dev server proxies `/api` to `http://127.0.0.1:8000`
(configured in `vite.config.ts`), so no frontend `.env` is required for local dev.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin (Acme Health) | `admin@acmehealth.com` | `password123` |
| Admin (FinFlow) | `admin@finflow.com` | `password123` |
| Candidate | `jordan.lee@example.com` | `password123` |
| Candidate | `mei.chen@example.com` | `password123` |

Or register a new account from the app — role is chosen at signup (`/register`).

### Tests

```bash
cd backend
pytest -q
```
83 tests covering auth, jobs, profiles, applications and their business rules,
matching (scoring, intent extraction, the full AI-provider failure matrix), and
analytics.

### Lint, format, typecheck, build

```bash
# backend
cd backend
ruff check app scripts
ruff format --check app scripts

# frontend
cd frontend
npm run lint         # oxlint
npx tsc -b            # typecheck
npm run build         # production build → frontend/dist
```
