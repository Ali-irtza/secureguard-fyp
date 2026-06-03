# SecureGuard Pro — Backend

FastAPI backend for SecureGuard Pro, an AI-powered security code scanner.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| DB Client | supabase-py 2.x |
| Config | pydantic-settings |
| Containerization | Docker |
| Validation | Pydantic v2 |
| File Storage | Supabase Storage |
| GitHub Integration | GitHub App (JWT + installation tokens) |

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point, CORS, router registration
│   ├── config.py            # Environment variables and settings (pydantic-settings)
│   ├── dependencies.py      # Shared dependencies (auth, db session)
│   ├── routers/             # One file per feature domain
│   │   ├── auth.py          # GET /auth/me, POST /auth/profile
│   │   ├── teams.py         # Full CRUD + GitHub App OAuth flow
│   │   ├── scans.py         # Branch file listing + vulnerability scan trigger
│   │   ├── projects.py      # Full CRUD + bulk delete
│   │   └── project_files.py # File upload, GitHub import, delete
│   ├── models/              # Pydantic schemas (request/response shapes)
│   │   ├── auth.py
│   │   ├── teams.py
│   │   ├── scans.py
│   │   ├── projects.py
│   │   └── project_files.py
│   └── services/            # Business logic, separated from routes
│       ├── auth/
│       │   └── profile_service.py
│       ├── teams/
│       │   ├── team_service.py
│       │   ├── member_service.py
│       │   └── github_service.py   # GitHub App JWT, installation tokens, branch sync
│       ├── scans/
│       │   └── scanner_service.py  # Hybrid code fetch + dummy scanner (ML plug-in point)
│       └── project_files/
│           └── file_service.py     # Upload, GitHub import, Supabase Storage
├── scripts/
│   └── migrations/          # Raw SQL migration files (run manually via Supabase dashboard)
│       ├── 001_enable_realtime.sql
│       ├── 002_create_projects_table.sql
│       ├── 003_create_project_files_bucket.sql
│       └── 004_create_project_files_table.sql
├── .env.example             # Template for environment variables
├── Dockerfile
├── github-app.pem           # GitHub App RSA private key (never commit the real one)
└── requirements.txt
```

## Getting Started

### 1. Clone and set up environment

```bash
cp .env.example .env
# Fill in your Supabase and GitHub App credentials in .env
```

### 2. Install dependencies

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

### 3. Run migrations

Migrations are plain SQL files in `scripts/migrations/`. Run them in order via the Supabase dashboard SQL editor or the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 4. Run with Docker

```bash
docker compose up --build
```

### 5. Run locally (dev)

```bash
uvicorn app.main:app --reload
venv\Scripts\activate && uvicorn app.main:app --reload
```

API docs available at: `http://localhost:8000/docs` (development only — disabled in production)

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `APP_ENV` | `development` or `production` |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_CLIENT_ID` | GitHub App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub App client secret |
| `GITHUB_PRIVATE_KEY_PATH` | Path to the GitHub App `.pem` private key file |
| `GITHUB_CALLBACK_URL` | OAuth callback URL (e.g. `http://localhost:8000/teams/github/callback`) |

## API Overview

### Auth

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/profile` | Create or update user profile |

### Teams

| Method | Endpoint | Description |
|---|---|---|
| GET | `/teams` | List all teams for the current user |
| POST | `/teams` | Create a new team |
| GET | `/teams/{id}` | Get a single team |
| PATCH | `/teams/{id}` | Update team name or GitHub repo |
| DELETE | `/teams/{id}` | Delete a team |
| POST | `/teams/{id}/github` | Connect a GitHub repo via PAT |
| POST | `/teams/{id}/github/refresh` | Re-fetch branches with a fresh PAT |
| POST | `/teams/{id}/github/sync-branches` | Re-sync branches using stored installation token |
| GET | `/teams/github/callback` | GitHub App OAuth callback |
| GET | `/teams/{id}/github/authorize` | Get GitHub App authorization URL |
| GET | `/teams/{id}/github/repos` | List repos accessible via installation token |
| POST | `/teams/{id}/github/select-repo` | Connect a specific repo from the installation |
| POST | `/teams/{id}/members` | Invite a member by email |
| PATCH | `/teams/{id}/members/{userId}` | Update member role or branch access |
| DELETE | `/teams/{id}/members/{userId}` | Remove a member |
| GET | `/teams/{id}/branches/{branch}/files` | List C/C++ files in a branch |
| GET | `/teams/{id}/branches/{branch}/files/content` | Get a single file's content |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects` | List all projects for the current user |
| POST | `/projects` | Create a new project |
| GET | `/projects/{id}` | Get a single project |
| PATCH | `/projects/{id}` | Update project details |
| DELETE | `/projects/{id}` | Delete a project |
| DELETE | `/projects/bulk-delete` | Delete multiple projects by ID |

### Project Files

| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects/{id}/files` | List all files for a project |
| POST | `/projects/{id}/files` | Upload a local file (multipart/form-data, max 10 MB) |
| POST | `/projects/{id}/files/github-import` | Import a file from the team's connected GitHub repo |
| DELETE | `/projects/{id}/files/{filename}` | Delete a file |

### Scans

| Method | Endpoint | Description |
|---|---|---|
| GET | `/teams/{id}/github/files` | List C/C++ files for a branch (scan file picker) |
| POST | `/teams/{id}/scans` | Trigger a vulnerability scan on selected files |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server health check — returns `{ status, env }` |

## Notes

- **Reports and Alerts routers** are scaffolded but not yet active (commented out in `main.py`).
- The **scanner** in `services/scans/scanner_service.py` currently runs a dummy model. It is the designated plug-in point for the real ML vulnerability detection model.
- **GitHub integration** uses a GitHub App (not a personal OAuth App). The App signs JWTs with an RSA private key (`github-app.pem`) to obtain installation access tokens — no user PAT is stored long-term.
- **File uploads** are restricted by project language: C projects accept `.c`/`.h`, C++ projects accept `.cpp`/`.cxx`/`.cc`/`.hpp`/`.hxx`/`.h`.
