# SecureGuard Pro — Frontend

React + TypeScript frontend for SecureGuard Pro, an AI-powered security code scanner.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 |
| Language | TypeScript 5 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 + tailwindcss-animate |
| UI Components | shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| Routing | React Router DOM v6 |
| Server State | TanStack React Query v5 |
| Forms | React Hook Form + Zod |
| Auth & DB | Supabase JS v2 |
| Charts | Recharts |
| Toasts | Sonner |
| Testing | Vitest + Testing Library + fast-check |

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx                  # Root component — router, providers, protected routes
│   ├── main.tsx                 # Entry point
│   ├── index.css                # Global styles + Tailwind directives
│   ├── components/
│   │   ├── auth/                # ProtectedRoute wrapper
│   │   ├── dashboard/           # Dashboard-specific components
│   │   ├── landing/             # Landing page sections
│   │   ├── scan/                # Scan flow components
│   │   ├── team/                # Team management components
│   │   └── ui/                  # shadcn/ui component library
│   ├── context/
│   │   └── UserContext.tsx      # Global auth/user state
│   ├── hooks/
│   │   ├── use-current-user.ts  # Current authenticated user
│   │   ├── use-onboarding.ts    # Onboarding flow state
│   │   ├── use-realtime-sync.ts # Supabase realtime subscription hook
│   │   ├── use-in-view.tsx      # Intersection observer hook
│   │   ├── use-mobile.tsx       # Responsive breakpoint hook
│   │   └── use-toast.ts         # Toast notification hook
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client (anon key, browser-safe)
│   │   ├── teams-api.ts         # Teams + GitHub API calls + apiFetch helper
│   │   ├── projects-api.ts      # Projects CRUD API calls
│   │   ├── project-files-api.ts # File upload, GitHub import, delete
│   │   ├── report-config.ts     # Report configuration helpers
│   │   ├── team-data.ts         # Static team data helpers
│   │   └── utils.ts             # cn() and other utilities
│   ├── pages/
│   │   ├── Landing.tsx          # Public landing page
│   │   ├── Auth.tsx             # Sign in / sign up
│   │   ├── AuthCallback.tsx     # Supabase OAuth callback handler
│   │   ├── ForgotPassword.tsx
│   │   ├── ResetPassword.tsx
│   │   ├── Onboarding.tsx       # Post-signup onboarding flow
│   │   ├── Dashboard.tsx        # Main app dashboard
│   │   ├── Projects.tsx         # Project list + bulk delete
│   │   ├── ProjectDetail.tsx    # Single project + file manager
│   │   ├── NewScan.tsx          # Scan creation flow
│   │   ├── ScanHistory.tsx      # Past scans
│   │   ├── Team.tsx             # Team management
│   │   ├── Reports.tsx          # Reports
│   │   ├── Alerts.tsx           # Security alerts
│   │   ├── Notifications.tsx    # Notifications
│   │   ├── Settings.tsx         # User settings
│   │   ├── Help.tsx             # Help & documentation
│   │   ├── About.tsx            # Public about page
│   │   ├── Privacy.tsx          # Privacy policy
│   │   ├── Terms.tsx            # Terms of service
│   │   ├── Contact.tsx          # Contact page
│   │   └── NotFound.tsx         # 404
│   ├── types/
│   │   └── realtime.ts          # Supabase realtime event types
│   └── test/
│       └── setup.ts             # Vitest + Testing Library setup
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── .env.example                 # Template for environment variables
├── components.json              # shadcn/ui configuration
├── tailwind.config.ts
├── vite.config.ts
└── vitest.config.ts
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Fill in your Supabase project URL, anon key, and backend API URL
```

### 3. Start the development server

```bash
npm run dev
```

App runs at `http://localhost:5173` by default.

### 4. Build for production

```bash
npm run build
```

### 5. Run tests

```bash
npm test
```

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (safe to expose in browser) |
| `VITE_API_URL` | FastAPI backend URL (default: `http://localhost:8000`) |

## Key Patterns

**Authentication** — Supabase Auth handles sign-up, sign-in, OAuth, and password reset. The `UserContext` exposes the current session globally. `ProtectedRoute` redirects unauthenticated users to `/auth`.

**API calls** — All backend requests go through `apiFetch()` in `lib/teams-api.ts`. It automatically attaches the Supabase JWT from the current session and throws typed errors from FastAPI's `{ detail }` responses.

**Caching** — Teams, projects, and branch files use a simple in-memory cache with TTL. Supabase Realtime subscriptions on the `teams`, `team_members`, and `projects` tables automatically bust the cache on any change, keeping data fresh across tabs without polling.

**File uploads** — `uploadProjectFile()` uses XHR (not `fetch`) to support upload progress callbacks. GitHub file imports go through the backend, which fetches from GitHub and saves to Supabase Storage.

**GitHub integration** — The Team page drives the full GitHub App OAuth flow: authorize → callback → list repos → select repo → sync branches. Branch file browsing and scan file selection use the cached branch files API.

## Routes

| Path | Access | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/auth` | Public | Sign in / sign up |
| `/auth/callback` | Public | Supabase OAuth callback |
| `/forgot-password` | Public | Password reset request |
| `/reset-password` | Public | Password reset form |
| `/about` | Public | About page |
| `/privacy` | Public | Privacy policy |
| `/terms` | Public | Terms of service |
| `/contact` | Public | Contact page |
| `/onboarding` | Protected | Post-signup onboarding |
| `/dashboard` | Protected | Main dashboard |
| `/projects` | Protected | Project list |
| `/projects/:id` | Protected | Project detail + file manager |
| `/new-scan` | Protected | Start a new scan |
| `/scan-history` | Protected | Past scans |
| `/team` | Protected | Team management + GitHub integration |
| `/reports` | Protected | Reports |
| `/alerts` | Protected | Security alerts |
| `/notifications` | Protected | Notifications |
| `/settings` | Protected | User settings |
| `/help` | Protected | Help & docs |
| `/design-system` | Public | Component design system preview |
