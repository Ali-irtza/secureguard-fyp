# Frontend Auth Components Documentation

## Overview
The `frontend/src/components/auth/` folder contains React components (written in TypeScript) that handle user authentication, registration, and route protection. These components form the authentication UI layer and connect directly to the backend via Supabase.

**Total Files**: 4  
**Language**: TypeScript + React JSX (*.tsx)  
**Key Integration**: Supabase Auth (frontend-side JWT tokens)

---

## File 1: BrandingPanel.tsx

### Purpose
Displays the left sidebar branding panel on login/register pages. Only visible on large screens (hidden on mobile for space).

### What It Does

**Visual Elements**:
- SecureGuard Pro logo with Shield icon
- Animated background pattern (circuit board grid + glowing nodes)
- Inspirational security quote: "Security is not a product, but a process." — Bruce Schneier
- Gradient blur effects (primary color + emerald green)
- Bottom status indicator: "Enterprise-grade protection"

### Component Structure

```typescript
const BrandingPanel = () => {
  return (
    <div className="hidden lg:flex ...">  {/* Hidden on mobile, shown on large screens */}
      {/* Animated circuit pattern background */}
      {/* Glow effects (blurred circles) */}
      {/* Logo section */}
      {/* Quote section */}
      {/* Bottom decoration */}
    </div>
  );
};
```

### Key Code Sections

#### Visibility Control (Line 5)
```typescript
className="hidden lg:flex flex-col justify-between h-full ..."
```
- `hidden`: Not visible by default
- `lg:flex`: Show only on large screens (≥1024px)
- Purpose: Save mobile screen space (phone screens are narrow)

#### Animated Background (Lines 8-20)
```typescript
<div className="absolute inset-0 opacity-10">
  <div style={{
    backgroundImage: `
      linear-gradient(to right, hsl(var(--primary) / 0.3) 1px, transparent 1px),
      linear-gradient(to bottom, hsl(var(--primary) / 0.3) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px'
  }} />
  {/* Glowing nodes */}
  <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
  ...
</div>
```

**What It Does**:
- Creates grid pattern (40px × 40px squares)
- Adds 4 glowing dots at different positions
- Each dot has staggered animation delay
- Creates tech/security aesthetic

**Performance**: CSS animations only (no JavaScript) — lightweight

#### Logo with Glow (Lines 29-32)
```typescript
<div className="relative">
  <Shield className="h-10 w-10 text-primary" />
  <div className="absolute inset-0 blur-lg bg-primary/50 -z-10" />
</div>
```

**What It Does**:
- Shield icon from lucide-react library
- Blurred background circle behind shield (glow effect)
- Creates depth/elevation

#### Quote Display (Lines 44-49)
```typescript
<blockquote className="text-2xl font-serif italic ...">
  "Security is not a product, but a process."
</blockquote>
<cite className="mt-4 block text-muted-foreground not-italic">
  — Bruce Schneier
</cite>
```

**Purpose**: Inspire confidence in security-conscious users

---

### Backend Connection
**None** — This is a pure UI component. No API calls or backend integration.

### When It Appears
- Login page: `frontend/src/pages/Login.tsx`
- Register page: `frontend/src/pages/Register.tsx`
- Only on desktop screens (hidden on mobile)

### Styling/Theming
Uses CSS variables for responsive design:
- `--primary`: Brand color (usually blue)
- `--foreground`: Text color
- `--background`: Background color
- `--muted-foreground`: Dimmed text

---

## File 2: LoginForm.tsx

### Purpose
Login form component that allows users to sign in with:
1. Email + Password (traditional login)
2. GitHub OAuth
3. Google OAuth

### What It Does

**User Actions**:
1. Enter email and password
2. Click "Sign In" → calls backend auth
3. On success: Navigate to `/dashboard`
4. On error: Show toast notification

**OAuth Alternative**:
- Click "Continue with GitHub" or "Continue with Google"
- Browser redirects to GitHub/Google login page
- User approves → redirected back to app
- App session created automatically

---

### Component Structure

#### Imports (Lines 1-18)

**React Hooks**:
```typescript
import { useState } from "react";
import { useForm } from "react-hook-form";  // Form state management
import { useNavigate } from "react-router-dom";  // Navigation
import { useToast } from "@/hooks/use-toast";  // Notifications
```

**UI Components**:
```typescript
import { Button, Input, Form, FormControl, etc } from "@/components/ui/";
```
- Reusable UI components (card design system)

**Supabase**:
```typescript
import { supabase } from "@/lib/supabase";
```
- Frontend Supabase client
- Communicates with backend auth service

**Icons**:
```typescript
import { Eye, EyeOff, Github, Mail, Lock } from "lucide-react";
```
- Icon library for visual elements

---

#### Form Validation (Lines 20-25)

```typescript
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
```

**What It Does**:
- `z.object()`: Define form schema
- `email`: Must be valid email format
- `password`: Minimum 6 characters
- `LoginFormValues`: TypeScript type (auto-generated from schema)

**Validation Happens**:
- Before form submit
- Real-time as user types
- Error messages shown below each field

---

#### State Management (Lines 27-32)

```typescript
const [showPassword, setShowPassword] = useState(false);  // Password visibility toggle
const [isLoading, setIsLoading] = useState(false);  // Loading state during sign-in
const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);  // OAuth loading
const { toast } = useToast();  // Toast notifications
const navigate = useNavigate();  // Page navigation

const form = useForm<LoginFormValues>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: "", password: "" },
});
```

**States Track**:
- `showPassword`: Is password visible or hidden?
- `isLoading`: Is form submitting?
- `oauthLoading`: Which provider is loading?
- `form`: Form data and validation state

---

#### Email + Password Login (Lines 42-60)

```typescript
const onSubmit = async (data: LoginFormValues) => {
  setIsLoading(true);
  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    toast({
      title: "Sign in failed",
      description: error.message,
      variant: "destructive",
    });
  } else {
    toast({ title: "Welcome back!", description: "Signed in successfully." });
    navigate("/dashboard");
  }
  setIsLoading(false);
};
```

**Flow**:

1. **setIsLoading(true)** → Disable button, show "Signing in..."
2. **supabase.auth.signInWithPassword()** → Call Supabase auth service
   - Backend validates email/password
   - On success: Returns JWT token
   - Frontend stores token in localStorage/sessionStorage
3. **If error** → Show error toast (e.g., "Invalid password")
4. **If success** → Show success toast + navigate to `/dashboard`
5. **setIsLoading(false)** → Re-enable button

**Backend Connection**:
- `supabase.auth.signInWithPassword()` sends credentials to Supabase
- Supabase (backend) validates against `auth.users` table
- Returns JWT token if valid
- Token stored in browser (used for subsequent API calls)

---

#### OAuth Login (Lines 72-91)

```typescript
const handleOAuthLogin = async (provider: "github" | "google") => {
  setOauthLoading(provider);
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    toast({
      title: "OAuth failed",
      description: error.message,
      variant: "destructive",
    });
    setOauthLoading(null);
  }
};
```

**OAuth Flow Explained** (Lines 65-71):
```
1. We call supabase.auth.signInWithOAuth({ provider })
2. Supabase redirects the browser to GitHub/Google login page
3. User approves → GitHub/Google redirects back to our app
4. Supabase reads the token from the URL and creates a session
5. User is now logged in
```

**Detailed Flow**:

1. **User clicks "Continue with GitHub"**
   - `handleOAuthLogin("github")` called
   - `setOauthLoading("github")` → Button shows "Redirecting..."

2. **supabase.auth.signInWithOAuth({ provider: "github" })** 
   - Supabase generates OAuth request
   - Browser redirected to: `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...`

3. **On GitHub.com**:
   - User logs in (if not already)
   - GitHub shows app permissions: "Read user profile, email"
   - User clicks "Authorize"

4. **GitHub redirects back**:
   - Browser goes to: `{window.location.origin}/auth/callback?code=XXX&state=XXX`
   - Frontend receives authorization code

5. **Supabase processes callback**:
   - Supabase client reads code from URL
   - Exchanges code for access token from GitHub
   - Creates user session in app
   - Creates profile in database (if new user)
   - Redirects to `/dashboard`

**Key Point**: `redirectTo` must match GitHub/Google app settings

---

#### Form Fields (Lines 97-145)

**Email Field**:
```typescript
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-foreground">Email</FormLabel>
      <FormControl>
        <div className="relative">
          <Mail className="absolute left-3 ... h-4 w-4 ..." />  {/* Mail icon */}
          <Input
            placeholder="you@example.com"
            className="pl-10 bg-background/50 ..."
            {...field}  {/* Bind to form state */}
          />
        </div>
      </FormControl>
      <FormMessage />  {/* Validation error shown here */}
    </FormItem>
  )}
/>
```

**What It Does**:
- `FormField`: Wrapper for field with validation
- `name="email"`: Field name (matches schema)
- `{...field}`: Spreads form binding (value, onChange, etc.)
- `<FormMessage />`: Shows validation errors
- Mail icon: Visual indicator

**Password Field** (Lines 118-145):
- Similar structure
- `type={showPassword ? "text" : "password"}`: Toggle visibility
- Eye icon button: Toggles showPassword state

---

#### OAuth Buttons (Lines 172-199)

```typescript
<Button
  type="button"
  variant="outline"
  className="w-full ..."
  onClick={() => handleOAuthLogin("github")}
  disabled={oauthLoading !== null}  {/* Disabled while loading */}
>
  <Github className="mr-2 h-5 w-5" />
  {oauthLoading === "github" ? "Redirecting..." : "Continue with GitHub"}
</Button>
```

**What It Does**:
- Full-width button
- GitHub icon + text
- Clicking calls OAuth handler
- Disabled while any OAuth is loading (prevents double-click)
- Shows "Redirecting..." while processing

**Google Button**: Same structure but with Google SVG

---

### Key Points to Understand

**Frontend ↔ Backend Connection**:
1. Frontend sends email/password to Supabase
2. Supabase backend validates (checks users table)
3. Backend returns JWT token
4. Frontend stores token (localStorage/sessionStorage)
5. Subsequent API calls include token in header: `Authorization: Bearer <token>`

**Token Usage**:
- After login, token stored in browser
- Every API request includes: `Authorization: Bearer <JWT>`
- Backend validates token (verifies signature)
- If valid: Request proceeds
- If invalid: 401 Unauthorized error

**OAuth Workflow**:
- User redirected to external provider (GitHub/Google)
- Provider sends code back to frontend
- Frontend exchanges code for session
- Backend creates/updates user profile

---

## File 3: ProtectedRoute.tsx

### Purpose
Wrapper component that protects routes requiring authentication. Redirects unauthenticated users to login page.

### What It Does

**Guard Logic**:
1. Check if user is logged in (via UserContext)
2. If user exists: Render the protected page
3. If no user: Redirect to `/auth` (login page)
4. While checking: Show nothing (prevent flash)

### Component Code

```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useUserContext();

  // Still checking session — render nothing to avoid flash
  if (loading) return null;

  // No session — redirect to login
  if (!user) return <Navigate to="/auth" replace />;

  return <>{children}</>;
};
```

### Code Explanation

#### Props (Line 4-6)
```typescript
interface ProtectedRouteProps {
  children: React.ReactNode;
}
```

**What It Does**:
- `children`: The page/component to protect
- `React.ReactNode`: Can be any React element(s)

**Usage Example**:
```typescript
<ProtectedRoute>
  <DashboardPage />
</ProtectedRoute>
```

---

#### User Context (Line 11)
```typescript
const { user, loading } = useUserContext();
```

**What It Does**:
- `useUserContext()`: Custom hook that reads from React Context
- `user`: Current logged-in user object (or null if not logged in)
- `loading`: Boolean indicating if session check is still in progress

**Where It Comes From**:
- UserContext initialized at app level (App.tsx)
- Automatically checks session on page load
- No additional API calls needed (session already loaded)

---

#### Loading State (Lines 13-14)
```typescript
if (loading) return null;
```

**Why This Matters**:
- On page load, app checks if user is logged in (reads localStorage)
- While checking: `loading = true`
- Return nothing → Don't flash login page then dashboard
- Once loaded: `loading = false` → Render appropriately

**Performance**: Prevents visual glitch (flash of unauthenticated state)

---

#### Redirect if Not Logged In (Lines 16-17)
```typescript
if (!user) return <Navigate to="/auth" replace />;
```

**What It Does**:
- `!user`: User is null (not logged in)
- `<Navigate to="/auth" replace />`: Redirect to login page
- `replace`: Replace history (user can't back-button to protected page)

**Example**:
- User tries to visit `/dashboard` without logging in
- ProtectedRoute sees `user === null`
- Redirects to `/auth` (login page)

---

#### Render Protected Page (Line 19)
```typescript
return <>{children}</>;
```

**What It Does**:
- User is logged in (`user` exists)
- `loading` is false
- Render the protected component

**Example**:
```typescript
<ProtectedRoute>
  <Dashboard />  ← This renders here if user is logged in
</ProtectedRoute>
```

---

### Usage in Routing

**In App.tsx (router setup)**:
```typescript
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import Project from "@/pages/Project";

const routes = [
  { path: "/auth", element: <LoginRegister /> },
  { path: "/dashboard", element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
  { path: "/projects/:id", element: <ProtectedRoute><Project /></ProtectedRoute> },
];
```

**What Happens**:
- `/auth` → Accessible to anyone
- `/dashboard` → Protected (redirects to `/auth` if not logged in)
- `/projects/:id` → Protected (redirects to `/auth` if not logged in)

---

### Backend Connection
**Minimal** — Relies on UserContext (which loads session from Supabase on app startup).

**No Direct API Calls** — Just checks local user state.

---

### Flow Diagram

```
User visits /dashboard
    ↓
ProtectedRoute component loads
    ↓
Reads UserContext: { user, loading }
    ↓
Is loading? → Yes: Return null (don't render)
              No: Continue
    ↓
Is user? → Yes: Render Dashboard component
           No: Redirect to /auth
```

---

## File 4: RegisterForm.tsx

### Purpose
Registration/signup form component. Allows new users to create an account with:
1. Email + Password (with confirmation)
2. Full name
3. Password strength validation
4. GitHub/Google OAuth signup

### What It Does

**User Actions**:
1. Enter full name, email, password, confirm password
2. View real-time password strength requirements
3. Click "Create Account" → Call backend auth
4. If success: Show "Check your email" message (confirmation email)
5. If error: Show error toast

---

### Component Structure

#### Imports (Lines 1-18)
Similar to LoginForm, includes same UI components and Supabase client.

---

#### Validation Schema (Lines 20-28)

```typescript
const registerSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
```

**Validation Rules**:
- `fullName`: Minimum 2 characters
- `email`: Valid email format
- `password`: Minimum 8 characters
- `confirmPassword`: Must match password (using `.refine()`)

**Validation Happens**:
- Real-time as user types
- On form submit
- Errors shown below each field

---

#### State Management (Lines 32-43)

```typescript
const [showPassword, setShowPassword] = useState(false);
const [showConfirmPassword, setShowConfirmPassword] = useState(false);
const [isLoading, setIsLoading] = useState(false);
const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
const { toast } = useToast();
const navigate = useNavigate();

const form = useForm<RegisterFormValues>({
  resolver: zodResolver(registerSchema),
  defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
});

const password = form.watch("password");  // Watch password changes
```

**Additional State**:
- `showConfirmPassword`: Toggle confirm password visibility
- `password`: Watch password field (used for real-time validation display)

---

#### Password Requirements Display (Lines 45-52)

```typescript
const passwordRequirements = [
  { label: "At least 8 characters", met: password.length >= 8 },
  { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
  { label: "Contains lowercase letter", met: /[a-z]/.test(password) },
  { label: "Contains number", met: /\d/.test(password) },
];
```

**What It Does**:
- Array of password strength rules
- `met`: Boolean indicating if requirement is met
- Shown in real-time as user types

**Rendered as** (Lines 200-217):
```typescript
{password && (
  <div className="space-y-2 p-3 rounded-lg ...">
    <p className="text-xs text-muted-foreground">Password requirements:</p>
    {passwordRequirements.map((req, index) => (
      <div key={index} className="flex items-center gap-1.5 ...">
        {req.met ? (
          <Check className="h-3 w-3 text-emerald" />  {/* Green checkmark */}
        ) : (
          <X className="h-3 w-3 text-muted-foreground" />  {/* Gray X */}
        )}
        <span className={req.met ? "text-emerald" : "text-muted-foreground"}>
          {req.label}
        </span>
      </div>
    ))}
  </div>
)}
```

**User Sees**:
- Real-time progress as they type
- ✓ "At least 8 characters" (green when met)
- ✗ "Contains uppercase" (gray X when not met)
- Updates dynamically as password changes

---

#### Email + Password Signup (Lines 63-101)

```typescript
const onSubmit = async (data: RegisterFormValues) => {
  setIsLoading(true);
  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,  // Store in user_metadata
      },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    toast({
      title: "Sign up failed",
      description: error.message,
      variant: "destructive",
    });
  } else if (signUpData.user && signUpData.user.identities?.length === 0) {
    // Email already registered
    toast({
      title: "Email already registered",
      description: "An account with this email already exists.",
      variant: "destructive",
    });
  } else {
    toast({
      title: "Check your email",
      description: "We sent a confirmation link to " + data.email,
    });
    navigate("/auth");
  }
  setIsLoading(false);
};
```

**Signup Flow Explained** (Lines 57-62):
```
1. supabase.auth.signUp creates the user in Supabase Auth
2. Supabase sends a confirmation email (if enabled in dashboard)
3. We store fullName in user_metadata — Supabase saves with user
4. Our DB trigger (from migration) auto-creates a profile row
```

**Detailed Flow**:

1. **setIsLoading(true)** → Disable button

2. **supabase.auth.signUp()** → Send signup request
   - `email`: User's email
   - `password`: User's password (hashed by Supabase)
   - `options.data.full_name`: Full name stored in `auth.users.raw_user_meta_data`
   - `options.emailRedirectTo`: Where to send confirmation link
   - Backend creates user in `auth.users` table

3. **Backend sends confirmation email**:
   - Email contains link: `{app-url}/auth/callback?token=XXX`
   - User clicks link in email

4. **If error** (e.g., email invalid, weak password):
   - Show error toast
   - User can try again

5. **If email already exists** (Lines 84-92):
   - Backend returns fake success (prevent email enumeration attacks)
   - But `identities` array is empty (tells us email exists)
   - Show error: "Email already registered"

6. **If success**:
   - Show: "Check your email" message
   - User must click confirmation email
   - After confirming: User can log in

7. **setIsLoading(false)** → Re-enable button

---

#### Full Name Field (Lines 129-148)

```typescript
<FormField
  control={form.control}
  name="fullName"
  render={({ field }) => (
    <FormItem>
      <FormLabel className="text-foreground">Full Name</FormLabel>
      <FormControl>
        <div className="relative">
          <User className="absolute left-3 ... h-4 w-4 ..." />
          <Input
            placeholder="John Doe"
            className="pl-10 ..."
            {...field}
          />
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**What It Does**:
- Text input for user's name
- User icon
- Validation: Minimum 2 characters

---

#### Email Field (Lines 150-168)
Same as LoginForm

---

#### Password Field (Lines 171-198)
Same as LoginForm but with stricter validation (minimum 8 characters vs 6)

---

#### Confirm Password Field (Lines 220-247)
Same structure as password field, separate input for confirmation

---

#### OAuth Signup (Lines 106-123)

```typescript
const handleOAuthLogin = async (provider: "github" | "google") => {
  setOauthLoading(provider);
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    toast({
      title: "OAuth failed",
      description: error.message,
      variant: "destructive",
    });
    setOauthLoading(null);
  }
};
```

**OAuth Signup Flow**:
- Same as OAuth login
- If email exists on GitHub: Creates local account
- If email new: Creates new account
- Supabase auto-creates user (backend handles)

---

### Key Differences: Signup vs Login

| Feature | Login | Signup |
|---------|-------|--------|
| **Fields** | Email + Password | Full Name + Email + Password + Confirm |
| **Password Length** | Min 6 chars | Min 8 chars |
| **Password Strength** | Not shown | Shown in real-time (4 requirements) |
| **Confirmation Email** | Not sent | Sent (user must click to activate) |
| **Metadata Stored** | None | Full name in `user_metadata` |
| **Next Page** | Dashboard | Back to login page (after confirming email) |

---

### Backend Connection

**Signup Process** (Frontend ↔ Backend):

1. **Frontend** calls `supabase.auth.signUp()`
2. **Backend** validates email/password
3. **Backend** hashes password (never stored plain-text)
4. **Backend** creates user in `auth.users` table
5. **Backend** stores full_name in `raw_user_meta_data`
6. **Backend** triggers email service (sends confirmation email)
7. **Database trigger** auto-creates profile row (from migration SQL)
8. **Frontend** shows "Check your email" message
9. **User clicks** email confirmation link
10. **Backend** marks user as verified
11. **User can now** log in

---

## Frontend-Backend Connection Summary

### Data Flow: Signup to Dashboard

```
1. User fills signup form
   └─ Frontend validates (email format, password length, etc.)

2. User clicks "Create Account"
   └─ Frontend: supabase.auth.signUp(email, password, full_name)
   └─ Backend: Receives request, validates, creates user
   └─ Backend: Sends confirmation email

3. User checks email, clicks confirmation link
   └─ Link: {app-url}/auth/callback?token=XXX
   └─ Frontend: Receives token, confirms signup
   └─ Backend: Marks user as verified

4. User logs in with email/password
   └─ Frontend: supabase.auth.signInWithPassword(email, password)
   └─ Backend: Validates credentials
   └─ Backend: Returns JWT token

5. Frontend stores JWT token (localStorage)
   └─ Now includes token in every API request
   └─ Header: Authorization: Bearer <JWT>

6. User navigates to /dashboard
   └─ Frontend: ProtectedRoute checks user exists
   └─ Renders Dashboard (JWT token used for data fetching)

7. Dashboard fetches projects
   └─ Frontend API call includes JWT token
   └─ Backend: Validates JWT, extracts user ID
   └─ Backend: Queries projects table (RLS filters by user)
   └─ Returns user's projects only
```

---

## Key Integration Points with Backend

### 1. Authentication Service
- **Frontend**: `supabase.auth.signUp()`, `supabase.auth.signInWithPassword()`
- **Backend**: Supabase Auth service (validates, creates JWT tokens)
- **Token**: Stored in frontend localStorage, included in headers

### 2. User Profile Creation
- **Frontend**: Sends `fullName` in signup
- **Backend**: Stores in `auth.users.raw_user_meta_data`
- **Database Trigger**: Migration SQL auto-creates profile row

### 3. Email Confirmation
- **Frontend**: Shows "Check your email" message
- **Backend**: Sends confirmation email with callback link
- **Frontend**: User clicks link → confirms signup

### 4. OAuth Flow
- **Frontend**: Redirect to GitHub/Google
- **GitHub/Google**: Authenticates user
- **Backend**: Receives OAuth callback, creates session
- **Frontend**: Redirected to dashboard with JWT

### 5. Protected Routes
- **Frontend**: `ProtectedRoute` checks user exists
- **Backend**: Not involved (uses local session state)
- **If unauthorized**: Frontend redirects to login

---

## File Organization

```
frontend/src/components/auth/
├── BrandingPanel.tsx ........... UI branding (no backend calls)
├── LoginForm.tsx ............... Email/password + OAuth login
├── ProtectedRoute.tsx .......... Route guard (checks local session)
└── RegisterForm.tsx ............ Email/password + OAuth signup
```

---

## Performance Notes

**Optimizations**:
- CSS animations (BrandingPanel) are GPU-accelerated
- Form validation happens client-side (no backend calls)
- OAuth redirects handled by external providers (fast)
- ProtectedRoute checks local state (no API overhead)

**No Unnecessary Backend Calls**:
- Password strength validation: Frontend only
- Email format validation: Frontend + backend
- Session checking: localStorage first, backend if needed

---

## Summary

| Component | Purpose | Backend Connection |
|---|---|---|
| **BrandingPanel** | Decorative sidebar | None |
| **LoginForm** | Email/Password + OAuth login | Supabase auth (signIn) |
| **ProtectedRoute** | Route protection guard | Reads local session state |
| **RegisterForm** | Email/Password + OAuth signup | Supabase auth (signUp) |

**Key Takeaway**: Auth components form the gateway to the app. They connect to Supabase backend for JWT token generation and session management. Once logged in, users access protected routes and the frontend includes JWT tokens in all API requests to authenticated endpoints.

---

**Total Documentation**: All 4 auth components explained with focus on backend integration, data flows, and purpose of each component.
