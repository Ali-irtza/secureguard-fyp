# SecureGuard Pro — Backend

FastAPI backend for SecureGuard Pro, an AI-powered security code scanner.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.11) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| DB Client | supabase-py |
| Migrations | Supabase CLI |
| Containerization | Docker + docker-compose |
| Validation | Pydantic v2 |
| File Storage | Supabase Storage |

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app entry point, CORS, router registration
│   ├── config.py            # Environment variables and settings
│   ├── dependencies.py      # Shared dependencies (auth, db session)
│   ├── routers/             # One file per feature domain
│   │   ├── auth.py
│   │   ├── scans.py
│   │   ├── projects.py
│   │   ├── teams.py
│   │   ├── reports.py
│   │   └── alerts.py
│   ├── models/              # Pydantic schemas (request/response shapes)
│   └── services/            # Business logic, separated from routes
│       ├── scanner.py       # Plug-in point for ML models
│       └── report_gen.py
├── supabase/
│   └── migrations/          # SQL migration files (run via Supabase CLI)
├── .env.example             # Template for environment variables
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Getting Started

### 1. Clone and set up environment

```bash
cp .env.example .env
# Fill in your Supabase credentials in .env
```

### 2. Install dependencies

```bash
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### 3. Run migrations

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
```

API docs available at: `http://localhost:8000/docs`

## Environment Variables

See `.env.example` for all required variables.

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | /auth/profile | Create/update user profile |
| GET | /auth/me | Get current user |
| GET/POST | /scans | List / create scans |
| GET/DELETE | /scans/{id} | Get / delete scan |
| GET/POST | /projects | List / create projects |
| GET/PUT/DELETE | /projects/{id} | Manage project |
| GET/POST | /teams | List / create teams |
| GET/PUT/DELETE | /teams/{id} | Manage team |
| POST/DELETE | /teams/{id}/members | Add / remove members |
| GET/POST | /reports | List / generate reports |
| GET | /reports/{id}/export | Export report |
| GET | /alerts | List alerts |
| PUT | /alerts/{id} | Update alert status |
