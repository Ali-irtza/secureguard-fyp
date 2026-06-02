# backend/app Configuration, Dependencies, and Main Documentation

## Overview
This document covers the three foundational files that initialize and configure the entire FastAPI backend application. These files set up configuration management, dependency injection, middleware, router registration, and authentication for all features across SecureGuard Pro.

---

## File: config.py

### Purpose
Central configuration management using Pydantic Settings to load environment variables from .env file at startup. Provides a single point of truth for all application configuration values.

### Imports
```
from pydantic_settings import BaseSettings, SettingsConfigDict
```

### Classes

#### Settings
**Purpose**: Pydantic-based configuration class that automatically reads from .env file at application startup.

**Key Feature**: If any required environment variable is missing, the application raises an error at startup — catching misconfigurations immediately rather than mid-request.

**Configuration Properties**:

**Supabase** (Required):
- `supabase_url: str` - Supabase project URL (e.g., https://xxxx.supabase.co)
- `supabase_anon_key: str` - Anon key for frontend/public queries
- `supabase_service_role_key: str` - Service role key for backend operations (bypasses RLS, NEVER expose to frontend)

**App Settings** (Optional with defaults):
- `app_env: str = "development"` - Environment (development/production/staging)
- `app_host: str = "0.0.0.0"` - Server host (all interfaces)
- `app_port: int = 8000` - Server port

**CORS** (Optional with default):
- `cors_origins: str = "http://localhost:5173"` - Comma-separated list of allowed frontend origins

**GitHub App** (Optional, for GitHub integration):
- `github_app_id: str = ""` - GitHub App ID from https://github.com/settings/developers
- `github_client_id: str = ""` - GitHub OAuth client ID
- `github_client_secret: str = ""` - GitHub OAuth client secret
- `github_private_key_path: str = "github-app.pem"` - Path to private key file
- `github_callback_url: str = "http://localhost:8000/teams/github/callback"` - OAuth callback endpoint

**FreeLLMAPI** (Optional, for AI scanning):
- `freellmapi_url: str = "http://localhost:3001/v1"` - FreeLLMAPI endpoint
- `freellmapi_key: str = ""` - API key for FreeLLMAPI authentication

**Properties**:

#### cors_origins_list (property)
**Purpose**: Converts comma-separated CORS string into a Python list.

**Logic Flow**:
- Splits the cors_origins string by comma
- Strips whitespace from each origin
- Returns list of origins

**Example**:
- Input: "http://localhost:5173,https://myapp.com"
- Output: ["http://localhost:5173", "https://myapp.com"]

**Use Case**: Dynamic CORS configuration without code changes — just update .env

---

#### is_development (property)
**Purpose**: Boolean convenience property to check if app is running in development mode.

**Logic Flow**:
- Returns True if app_env == "development", False otherwise

**Use Case**: Conditionally enable/disable features based on environment (e.g., API docs, verbose logging)

---

**model_config** (Pydantic configuration):
```python
SettingsConfigDict(
    env_file=".env",              # Read from .env file
    env_file_encoding="utf-8",    # UTF-8 encoding
    case_sensitive=False,         # SUPABASE_URL and supabase_url both work
)
```

**Benefits**:
- Case-insensitive environment variable names (uppercase .env works with lowercase Python)
- Single .env file for all configuration
- Automatic type coercion (string "8000" becomes int 8000)

---

### Module-Level Export

#### settings (singleton instance)
```python
settings = Settings()
```

**Purpose**: Single instance used across the entire application.

**Import Pattern**: Everywhere in the codebase imports from config:
```python
from app.config import settings
# Now use settings.supabase_url, settings.app_env, etc.
```

**Benefits**:
- DRY (Don't Repeat Yourself) — configuration loaded once, used everywhere
- Type-safe: IDEs provide autocomplete for all config properties
- Centralized: Change config in one place, affects entire app
- Fail-fast: Missing required variables raise error at startup, not during request

---

========================================================

## File: dependencies.py

### Purpose
Provides FastAPI dependency injection functions for Supabase client access and JWT authentication. Uses FastAPI's Depends() pattern to inject these dependencies into route handlers.

### Imports
```
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.config import settings
```

### Module-Level Singleton

#### _supabase_client (private global)
```python
_supabase_client: Client | None = None
```

**Purpose**: Holds the single shared Supabase client instance.

**Rationale for Singleton**:
- Creating a new client per request causes fresh TCP + TLS handshake on every API call
- Adds ~1-2 seconds of overhead per request (network latency + SSL negotiation)
- Single shared instance reuses underlying HTTP connection pool
- Result: Massive performance improvement for high-throughput APIs

---

### Functions

#### get_supabase() → Client
**Purpose**: Returns the shared Supabase client singleton, initializing on first call.

**Logic Flow**:
- Checks global _supabase_client variable
- If None (first call):
  - Creates new Supabase client using create_client() from supabase-py library
  - Passes supabase_url and supabase_service_role_key from settings
  - Uses service_role key (not anon key) so backend can manage data for any user
  - Stores client in global _supabase_client
- Returns the client instance

**Security Note**: Uses service_role_key (bypasses Row-Level Security policies). This is INTENTIONAL and SAFE because:
- Backend code is trusted
- Only backend/admin can call this
- Frontend gets anon_key (subject to RLS policies)
- Service role key is NEVER exposed to frontend

**Usage Pattern**:
```python
# In any route handler:
async def some_route(supabase: Client = Depends(get_supabase)):
    # FastAPI automatically calls get_supabase() and passes result
    result = supabase.table("teams").select("*").execute()
```

---

#### bearer_scheme (module-level object)
```python
bearer_scheme = HTTPBearer()
```

**Purpose**: FastAPI security scheme that reads JWT token from Authorization header.

**How It Works**:
- Expects request header: `Authorization: Bearer <jwt_token>`
- Extracts the token portion (everything after "Bearer ")
- Returns HTTPAuthorizationCredentials object containing the token

**Usage Pattern**:
```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    token = credentials.credentials  # Extract token string
```

---

#### get_current_user() → dict (async)
**Purpose**: Validates JWT token from Authorization header and returns authenticated user data.

**Authentication Flow**:
1. Frontend logs in via Supabase Auth endpoint → receives JWT token
2. Frontend stores token in localStorage (or session)
3. Frontend includes token in every protected request: `Authorization: Bearer <token>`
4. FastAPI calls get_current_user() dependency
5. This function asks Supabase: "Verify this token and return user data"
6. Supabase validates JWT signature and checks expiration
7. If valid → returns user object
8. If invalid/expired → raises 401 Unauthorized (request blocked immediately)

**Function Signature**:
```python
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    supabase: Client = Depends(get_supabase),
) -> dict:
```

**Dependencies**:
- `credentials`: Obtained from bearer_scheme (extracts token from header)
- `supabase`: Obtained from get_supabase() (shares connection pool)

**Logic Flow**:
- Extracts token string from credentials object
- Calls `supabase.auth.get_user(token)` to verify token with Supabase
- Validates response is not None and response.user exists
- If valid: returns response.user (dict with user metadata)
- If invalid: raises 401 Unauthorized with message "Invalid or expired token"
- Exception handler catches any errors during validation: raises 401 with message "Could not validate credentials"

**User Object Returned** (example):
```python
{
    "id": "uuid-of-user",
    "email": "user@example.com",
    "user_metadata": {...},
    "created_at": "2024-01-01T00:00:00Z",
    ...
}
```

**Usage Pattern** — Making a route protected:
```python
from fastapi import Depends
from app.dependencies import get_current_user

@app.get("/protected-route")
async def protected_route(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    # Only runs if JWT is valid; FastAPI automatically handles 401 if invalid
    return {"message": f"Hello {user_id}"}
```

**Security Properties**:
- Stateless: No session storage needed; JWT contains all info
- Fast: Token validation done by Supabase, no DB query needed
- Scalable: Can run on multiple servers; any server can validate any token
- Revocable: Supabase can revoke tokens server-side if needed

---

========================================================

## File: main.py

### Purpose
Application entry point that initializes the FastAPI app, configures middleware, registers routers, and sets up health checks. This is where all the pieces (config, dependencies, routes) come together.

### Imports
```
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
```

### FastAPI App Instance

#### app (module-level object)
```python
app = FastAPI(
    title="SecureGuard Pro API",
    description="AI-powered security code scanner backend",
    version="1.0.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)
```

**Configuration**:
- `title`: Shows in API documentation
- `description`: Shows in API documentation
- `version`: API version (used in Release notes, versioning)
- `docs_url`: OpenAPI/Swagger documentation endpoint
  - `/docs` if development (enable for testing)
  - None if production (disable to not expose API structure publicly)
- `redoc_url`: ReDoc documentation endpoint
  - Disabled in production for security

**Benefits**:
- Auto-generated API docs at `/docs` (Swagger UI)
- Auto-generated ReDoc at `/redoc` (ReDoc UI)
- Development: Full docs for frontend/testing
- Production: Docs disabled for security

---

### CORS Middleware

#### Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Dynamic from .env
    allow_credentials=True,
    allow_methods=["*"],   # GET, POST, PUT, DELETE, PATCH, etc.
    allow_headers=["*"],   # Authorization, Content-Type, Custom headers, etc.
)
```

**What CORS Does**:
- CORS = Cross-Origin Resource Sharing
- Browsers block requests from one domain to another by default (same-origin policy for security)
- Example problem: Frontend on localhost:5173 cannot call API on localhost:8000 without CORS headers
- Solution: Backend tells browser "requests from localhost:5173 are allowed"

**Configuration Details**:
- `allow_origins`: List of frontends allowed to call this API
  - Example: ["http://localhost:5173", "https://myapp.com", "https://app.myapp.com"]
  - Reads from .env via settings.cors_origins_list (dynamic)
  - Can be updated without restarting backend (deploy new .env)
- `allow_credentials`: True = frontend can send cookies/credentials in requests
- `allow_methods`: "*" = all HTTP methods allowed (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- `allow_headers`: "*" = all headers allowed, including Authorization

**Request/Response Flow**:
1. Frontend sends preflight OPTIONS request to backend
2. Backend responds with CORS headers
3. Browser checks headers; if origin is allowed, proceeds with actual request
4. Backend sends response with CORS headers again
5. Browser checks; if allowed, JavaScript receives response

---

### Router Registration

#### Router Imports and Registration
```python
from app.routers import auth, teams, scans, projects, project_files

app.include_router(auth.router,          prefix="/auth",     tags=["Auth"])
app.include_router(teams.router,         prefix="/teams",    tags=["Teams"])
app.include_router(scans.router,         prefix="/teams",    tags=["Scans"])
app.include_router(scans.router,         prefix="",          tags=["Scans"])
app.include_router(projects.router,      prefix="/projects", tags=["Projects"])
app.include_router(project_files.router, prefix="/projects", tags=["Project Files"])
```

**Routing Map**:

| Router | Prefix | Routes |
|--------|--------|--------|
| auth | /auth | /auth/login, /auth/signup, /auth/profile, etc. |
| teams | /teams | /teams, /teams/{team_id}, /teams/{team_id}/members, etc. |
| scans | /teams | /teams/{team_id}/scans, /teams/{team_id}/scans/{scan_id}, etc. |
| scans | (empty) | (global scan-related routes) |
| projects | /projects | /projects, /projects/{project_id}, etc. |
| project_files | /projects | /projects/{project_id}/files, etc. |

**Design Pattern**:
- Each feature domain has its own router file in app/routers/
- Prefix: /auth, /teams, /projects paths organized by feature
- Tags: Automatically groups endpoints in API docs by tag
- Modularity: Add new features by uncommenting/commenting include_router() lines
- Scalability: No need to modify main.py structure when adding routes; just call include_router()

**Commented-Out Routers**:
```python
# app.include_router(reports.router,  prefix="/reports",  tags=["Reports"])
# app.include_router(alerts.router,   prefix="/alerts",   tags=["Alerts"])
```
- Future features (reports, alerts) are planned but not yet implemented
- Easy to enable: uncomment when feature is ready

---

### Health Check Endpoint

#### @app.get("/health")
```python
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "env": settings.app_env}
```

**Purpose**: Simple endpoint to confirm server is running.

**Response**:
```json
{
    "status": "ok",
    "env": "development"
}
```

**Use Cases**:
- Docker health checks: Container orchestrators call /health to verify container is alive
- Load balancers: Health check endpoints verify instances before sending traffic
- Monitoring tools: External services monitor /health to detect outages
- CI/CD pipelines: Tests verify deployment succeeded by checking /health
- Developers: Quick sanity check that server is running

**Industry Standard**: Every production backend has a health check endpoint

---

## Application Initialization Flow

### Startup Sequence
1. **Python imports main.py**
   - Loads app instance
   - Loads CORSMiddleware
   - Registers routers
   - Defines health check

2. **On first request to any route**:
   - Dependencies are called if needed (get_supabase, get_current_user)
   - get_supabase() initializes _supabase_client singleton on first call
   - Subsequent requests reuse the same client

3. **At application shutdown**:
   - Supabase client connection pool is closed gracefully

---

## Dependency Injection Pattern

### Why FastAPI Uses Depends()
- **Inversion of Control**: Route handlers don't create dependencies; FastAPI injects them
- **Reusability**: Same dependency used across many routes
- **Testability**: Easy to mock dependencies in tests
- **Performance**: Dependencies are cached within a single request

### Common Dependency Patterns in Routes

**Getting current user + supabase client**:
```python
async def some_route(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    # current_user["id"] has authenticated user's ID
    # supabase is shared client instance
```

**Just supabase, no auth**:
```python
async def public_route(supabase: Client = Depends(get_supabase)):
    # Public endpoint, no authentication required
```

**Multiple custom dependencies**:
```python
async def complex_route(
    current_user: dict = Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
    custom_value: str = Depends(get_something_else),
):
    # All dependencies injected automatically
```

---

## Environment Variables Required at Startup

### Required (App crashes if missing)
- `SUPABASE_URL` - Project URL
- `SUPABASE_ANON_KEY` - Anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### Optional (Defaults provided)
- `APP_ENV` - Defaults to "development"
- `APP_HOST` - Defaults to "0.0.0.0"
- `APP_PORT` - Defaults to 8000
- `CORS_ORIGINS` - Defaults to "http://localhost:5173"
- `GITHUB_*` - Optional for GitHub integration features
- `FREELLMAPI_*` - Optional for AI scanning features

### Example .env
```
SUPABASE_URL=https://project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=abc123
GITHUB_CLIENT_SECRET=secret123
GITHUB_PRIVATE_KEY_PATH=github-app.pem

FREELLMAPI_URL=http://localhost:3001/v1
FREELLMAPI_KEY=key123
```

---

## API Documentation & Endpoints

### Auto-Generated Documentation
- **Swagger UI**: http://localhost:8000/docs (development only)
- **ReDoc**: http://localhost:8000/redoc (development only)
- **OpenAPI JSON**: http://localhost:8000/openapi.json

### Health Check
- **GET** `/health` - Returns `{"status": "ok", "env": "development"}`

### All Other Routes
- Registered from routers in app/routers/
- Organized by prefix and tags (see Router Registration section)

---

## Security Considerations

### CORS
- ✅ Enabled only for configured origins
- ✅ Prevents unauthorized domains from calling API
- ✅ Credentials allowed (Authorization header passed through)

### Authentication
- ✅ JWT tokens validated for every protected route
- ✅ Service role key kept server-side only
- ✅ Frontend uses anon key (subject to RLS policies)

### Configuration
- ✅ Sensitive values in .env (not in code)
- ✅ API docs disabled in production
- ✅ Fail-fast: Missing config raises error at startup

### Best Practices Implemented
- ✅ Single Supabase client reused (no connection exhaustion)
- ✅ Dependencies injected (loose coupling)
- ✅ Clear separation: config, dependencies, routing
- ✅ Type hints throughout (IDE support, runtime checks)
