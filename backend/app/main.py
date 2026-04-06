from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

# ---------------------------------------------------------------------------
# App Instance
# ---------------------------------------------------------------------------
# This is the core FastAPI application object.
# title, description, version show up in the auto-generated API docs at /docs
# ---------------------------------------------------------------------------
app = FastAPI(
    title="SecureGuard Pro API",
    description="AI-powered security code scanner backend",
    version="1.0.0",
    # Disable docs in production — no need to expose API structure publicly
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# ---------------------------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------------------------
# CORS = Cross-Origin Resource Sharing
# Browsers block requests from one domain to another by default (security).
# We need to explicitly tell the backend: "yes, requests from our frontend
# are allowed." Without this, the React frontend cannot talk to this API.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # reads from .env dynamically
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],   # Authorization, Content-Type, etc.
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# Each feature domain has its own router file.
# We register them here — this keeps main.py clean and focused.
# As we build each feature, we uncomment the import and include the router.
# ---------------------------------------------------------------------------
# from app.routers import auth, scans, projects, teams, reports, alerts
# app.include_router(auth.router,     prefix="/auth",     tags=["Auth"])
# app.include_router(scans.router,    prefix="/scans",    tags=["Scans"])
# app.include_router(projects.router, prefix="/projects", tags=["Projects"])
# app.include_router(teams.router,    prefix="/teams",    tags=["Teams"])
# app.include_router(reports.router,  prefix="/reports",  tags=["Reports"])
# app.include_router(alerts.router,   prefix="/alerts",   tags=["Alerts"])


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------
# A simple endpoint to confirm the server is running.
# Used by Docker, load balancers, and monitoring tools.
# Industry standard — every backend has one.
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "env": settings.app_env}
