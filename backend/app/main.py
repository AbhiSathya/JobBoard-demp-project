from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.applications import jobs_router as job_applications_router
from app.api.applications import router as applications_router
from app.api.auth import router as auth_router
from app.api.candidates import router as candidates_router
from app.api.jobs import router as jobs_router
from app.api.match import router as match_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware

configure_logging()
settings = get_settings()

app = FastAPI(title="Job Board API", version="0.2.0")

# Order matters: CORS is added last so it runs outermost and can attach headers even to
# responses produced by the layers beneath it.
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[REQUEST_ID_HEADER],
)

register_exception_handlers(app)
app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(candidates_router)
app.include_router(applications_router)
app.include_router(job_applications_router)
app.include_router(match_router)
app.include_router(admin_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
