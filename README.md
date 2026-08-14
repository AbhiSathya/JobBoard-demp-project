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
- A dashboard of pipeline, applications-per-posting, skill demand vs. applicant
  supply, and applications over time — computed live from the database, never hardcoded
- Email on every event that matters: a new applicant on your posting, and a status
  update sent to the candidate when you shortlist or reject

**Candidate**
- Create and update a profile (skills, education, projects, preferences)
- Browse jobs with debounced search, skill/location/experience filters that combine
  predictably, sorting and pagination — all synced to the URL, so a filtered view
  survives a reload and can be shared
- Describe a desired role in plain English and get ranked, explained matches
- Apply to a job with the saved profile; duplicate and closed-job applications are rejected
- Verify an email address, reset a forgotten password, and stay signed in across an
  expired access token without noticing

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
| Charts | Recharts | The dashboard's bar, paired-bar and area charts |
| Email | stdlib `smtplib` + `email.message` | SMTP, STARTTLS and multipart HTML/text with zero new dependencies. With no SMTP host configured every message is written to the log instead, so the flows are demoable offline |
| Logging | stdlib `logging` | Per-run file in `backend/logs/`, ANSI colour on a TTY only, a request id threaded through every line via `contextvars` |

No Docker, no Redis, no ORM beyond SQLAlchemy, no component library, no LLM SDK —
each was left out because nothing in this project's scope needed it.

## Architecture

```
React SPA (Vite, TS)                      FastAPI
┌─────────────────────────────────┐      ┌───────────────────────────────────┐
│ pages/       candidate, admin   │      │ api/        routers (thin)        │
│ components/  ui, layout, domain │      │ schemas/    Pydantic I/O          │
│ lib/api.ts   fetch client       │ HTTP │ services/   business rules, mail  │
│ hooks/       TanStack Query     │ ───► │ matching/   intent, score, explain│
│ access token in memory,         │      │ models/     SQLAlchemy 2.0        │
│ refresh token in httpOnly cookie│      │ core/  config, security, logging, │
└─────────────────────────────────┘      │        mail transport, middleware │
                                         └──────────────┬────────────────────┘
                           ┌──────────────────┬─────────┴──────────┐
                        SQLite            OpenRouter             SMTP
                     (SQLAlchemy       (optional; a         (optional; with no
                      + Alembic)        deterministic        host every message
                                        fallback runs        is written to
                                        without it)          backend/logs/)
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
  logs/         per-run log files, gitignored
  tests/        pytest suite (154 tests)
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
            ├─ LLM (OpenRouter, strict JSON, model chain, 12s/call, Pydantic-validated)
            └─ fallback: deterministic keyword extractor (vocabulary built from live job data)
                                    │
open jobs ─► score_job(intent, profile, job) → ScoreBreakdown   [pure Python, unit-tested]
                                    │
                          rank, band, explain(breakdown)   [built from the breakdown's own facts]
                                    │
                    LLM rephrases the top 3 ──► fact-checked ──► kept, or template ships
```

- **Intent extraction** (`app/matching/intent.py`, `provider.py`) turns the free-text
  query into structured fields. If `OPENROUTER_API_KEY` is set, it tries each configured
  model in turn (12s per call, inside an 18s budget for the whole request); on *any*
  failure — no key, timeout, non-200, empty content, malformed JSON, or a response that
  fails schema validation — it falls back to a deterministic keyword/regex extractor
  built from the vocabulary of currently open jobs. This fallback is not a degraded mode
  kept around for emergencies: it's exercised by every test, it produces the same
  ranking as the live path, and it is what runs the whole pipeline when no key is set.
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
  your stated interest. Location differs: role is in Berlin."). For the top 3 results
  the model is then asked to rephrase that template into one natural paragraph — and
  the rewrite is only kept if it passes `app/matching/llm_explain.py`, which checks
  that every skill, domain and location it names came off the breakdown *and* that it
  doesn't claim a match for something the breakdown lists as missing. A rewrite that
  fails either check is discarded and the template ships. That is what makes "never
  invent skills or facts" a structural guarantee rather than a prompt instruction: the
  model can change the wording, never the facts, and never the ranking. Each result
  reports which wording shipped (`explanation_source: "ai" | "rules"`) and the response
  carries `ai_status` (`live` / `degraded` / `fallback`), so the UI states the truth
  instead of implying an AI ran when it didn't.
- **Model chain.** `OPENROUTER_MODELS` is an ordered list of free models; a 404, a 429
  or a timeout on one falls through to the next, and the model that last answered is
  tried first next time. The whole AI path runs under a total budget (18s), so a
  rate-limited provider can slow a match down but never hang it.
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
2. Auth is real JWT with scrypt-hashed passwords. Every token carries a `typ` claim
   (`access` 15 min, `refresh` 14 days, `verify` 24 h, `reset` 30 min) and is rejected
   if presented as the wrong type, so a reset link can't be replayed as a session. The
   refresh token lives in an httpOnly SameSite=Lax cookie; the access token stays in
   memory in the SPA and is refreshed silently on the first 401. A completed password
   reset bumps the user's `token_version`, invalidating every outstanding refresh and
   reset token at once. Unverified users can sign in and browse — verification only
   gates applying and posting, so no demo is ever blocked on a mail server.
3. `education` / `projects` are JSON on the candidate profile, not separate tables — see
   Data model above for the reasoning and upgrade path.
4. An application freezes the candidate's profile at submit time (`profile_snapshot`).
5. AI matching only ever considers jobs with `status = open`.
6. Application pipeline: `applied → shortlisted → rejected`, or `applied → rejected`
   directly. `rejected` is terminal — any other transition is rejected with the
   allowed set named in the error.
7. No salary field — not in the brief, so not invented.

## Known limitations

- Skill and domain matching is keyword-based, not semantic — "JS" won't match
  "JavaScript" unless both strings appear.
- Email is sent inline over SMTP from a background task. No queue, no retry: a send
  that fails is logged and dropped rather than retried later.
- Rate limiting exists nowhere — a determined client can hammer `/api/match`.
- Frontend bundle is a single chunk (~253 KB gzipped) — fine at this app's size; would
  code-split before it grew much further.

## Future improvements

- Embedding-based semantic skill/domain matching
- Postgres + connection pooling for real concurrent load
- Recruiter teams per company
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

### The short way

```bash
./dev.sh            # Linux / macOS
```
```powershell
.\dev.ps1           # Windows
```

One command for the whole stack. It resolves paths from its own location (so it works
from any directory), refuses to start if port 8000 or 5173 is already taken and tells you
what to do about it, creates `backend/.env` from the example if it is missing, applies
migrations, then runs both servers with their output interleaved and prefixed `[api]` /
`[web]`. **Ctrl-C stops both** — including uvicorn's reloader child and npm's, which are
what usually get orphaned and hold a port. If either server dies on its own, the other is
shut down rather than left half-running.

First run on a clean machine, or to reinstall dependencies:

```bash
./dev.sh --setup           # creates backend/.venv, pip install -e ".[dev]", npm install
.\dev.ps1 -Setup           # same on Windows
```

Other ports: `API_PORT=8001 WEB_PORT=5174 ./dev.sh`, or `.\dev.ps1 -ApiPort 8001
-WebPort 5174`.

Wrapper logs land in `logs/dev-api.log` and `logs/dev-web.log` (gitignored). The
application's own structured log is unchanged, in `backend/logs/`.

If PowerShell refuses to run the script — *"running scripts is disabled on this system"* —
use `powershell -ExecutionPolicy Bypass -File .\dev.ps1`.

The rest of this section is the same thing done by hand, which is worth reading once.

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

`SMTP_HOST` is also optional. **Leave it unset and every email — verification links,
password resets, application notifications — is written in full to
`backend/logs/jobboard-<timestamp>.log` instead of being sent**, so the whole flow is
usable on a laptop with no mail account, and dummy addresses work fine. Set the `SMTP_*`
block to send for real; nothing else changes.

That means you confirm an address by pulling the link out of the log:

```bash
# after registering — the verification link
grep -o 'http://localhost:5173/verify-email?token=[A-Za-z0-9._-]*' backend/logs/*.log | tail -1

# after "forgot password" — the reset link
grep -o 'http://localhost:5173/reset-password?token=[A-Za-z0-9._-]*' backend/logs/*.log | tail -1

# or just watch them arrive while you click
tail -f backend/logs/jobboard-*.log
```

Verification links last 24 hours (`VERIFY_TOKEN_HOURS`), reset links 30 minutes
(`RESET_TOKEN_MINUTES`) and are single-use. `POST /api/auth/resend-verification` issues a
fresh one. Unverified users can still sign in and browse — verification only gates
applying and posting — so a missing mail server never blocks a demo.

### A note on the OpenRouter free tier

Free models share a **per-day request quota on the account** — 50/day without credits,
1000/day once $10 of credit is added. Each match request spends up to two of them (one to
parse the query, one to rewrite the explanations). Exhaust it and every model in the chain
returns `429`, the deterministic path takes over, and the response comes back in about
half a second with `ai_status: fallback` and identical ranking — which is the fallback
working, not a failure. It looks like this in the log:

```
WARNING | AI model google/gemma-4-26b-a4b-it:free unusable, trying next: HTTP 429:
         "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000..."
WARNING | AI intent extraction failed, using deterministic result
INFO    | POST /api/match -> 200 in 553.0ms
```

Before a live demo: run one match and check the header says *Matched with {model}*. If it
says *Matched offline*, the quota is spent — it resets at 00:00 UTC. Setting
`AI_EXPLANATIONS=false` halves the spend per request.

### Environment variables

Every one has a working default except `JWT_SECRET`; the file to copy is `.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./jobboard.db` | Any SQLAlchemy URL; Postgres is a string change |
| `JWT_SECRET` | dev placeholder | **Set this.** Signs every token |
| `ACCESS_TOKEN_MINUTES` | `15` | Access-token lifetime. Set to `1` to watch the silent refresh work |
| `REFRESH_TOKEN_DAYS` | `14` | Refresh-cookie lifetime |
| `VERIFY_TOKEN_HOURS` / `RESET_TOKEN_MINUTES` | `24` / `30` | Email link lifetimes |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | Where the emailed links point |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON array or comma-separated; credentials are allowed, so it can't be `*` |
| `OPENROUTER_API_KEY` | empty | Empty → the deterministic path runs and `ai_status` reports `fallback` |
| `OPENROUTER_MODELS` | 4 free models | Comma-separated, tried in order |
| `AI_TIMEOUT_SECONDS` | `12` | Per-call cap, inside an 18s total AI budget |
| `AI_EXPLANATIONS` | `true` | `false` skips the rewrite call — roughly halves match latency, keeps the ranking identical |
| `SMTP_HOST` / `PORT` / `USER` / `PASSWORD` | unset | Unset → mail goes to the log instead of the network |
| `SMTP_FROM` | `Job Board <no-reply@jobboard.local>` | From header |

Logs land in `backend/logs/`, one file per run named `jobboard-YYYY-MM-DD_HH-MM-SS.log`,
with the 30 most recent runs kept. Every line carries the request id that is also
returned as the `X-Request-ID` header and in error bodies, so a reported error maps
straight to its log lines. The console mirror is colour-coded by level, and drops the
colour automatically when stdout isn't a TTY.

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
154 tests covering auth (token types, refresh rotation, `token_version`
invalidation), the email flows (verification, reset single-use, resend,
enumeration-safety — asserted against an in-memory outbox, never a real SMTP server),
jobs, profiles, applications and their business rules, matching (scoring, intent
extraction, explanation grounding, the full AI-provider failure matrix), and analytics.

One test is skipped by default because it calls the real OpenRouter API. Run it by
hand before a demo to prove the key and the model chain are live:

```bash
RUN_LIVE_AI=1 pytest tests/test_live_openrouter.py -v
```

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
