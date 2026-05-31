# Backend App Services Auth Documentation

This document provides comprehensive information about the authentication services defined in `backend/app/services/auth`. These services handle the business logic for user profile management and authentication-related operations.

---

## Directory Structure

```
backend/app/services/auth/
├── __init__.py          # Package initialization (imports)
└── profile_service.py   # User profile business logic functions
```

---

## __init__.py

### Purpose
Package initialization file for the auth services module. Primarily used for exporting public functions and modules.

### Content
Simple package marker with descriptive comment:
```
# Auth services package
```

### Use Case
Python package declaration that allows importing functions from this module using:
```python
from app.services.auth import get_user_profile, upsert_user_profile
```

---

## profile_service.py

### Purpose
Handles all user profile database operations and retrieval logic. Provides business logic functions for getting and updating user profiles in Supabase.

### Imports
- `HTTPException, status` from `fastapi` - For raising HTTP errors
  - `HTTPException` - Create error responses
  - `status` - HTTP status code constants
- `Client` from `supabase` - Type hint for Supabase client

### Functions

#### get_user_profile()

**Purpose**: Fetches a user's profile data from the Supabase profiles table and merges it with auth information.

**Function Signature**:
```python
def get_user_profile(user_id: str, email: str, supabase: Client) -> dict
```

**Parameters**:
- `user_id: str` - Unique identifier of the user (UUID)
- `email: str` - User's email from Supabase auth.users table
- `supabase: Client` - Supabase client instance for database access

**Returns**:
- `dict` - Dictionary with keys:
  - `id: str` - User ID
  - `email: str` - User's email (from auth.users)
  - `full_name: Optional[str]` - User's full name (from profiles table, can be None)
  - `avatar_url: Optional[str]` - URL to user's avatar (from profiles table, can be None)
  - `created_at: Optional[datetime]` - Timestamp when profile was created (can be None)

**Logic Flow**:
1. Query Supabase profiles table for record matching the user_id
2. Use `.select("*")` to fetch all columns
3. Use `.eq("id", user_id)` to filter by exact user_id match
4. Use `.single()` to expect exactly one result
5. Execute the query
6. Extract profile data from result (defaults to empty dict if not found)
7. Build response dictionary combining:
   - User ID (from parameter)
   - Email (from parameter - comes from Supabase auth)
   - Full name (from profile or None)
   - Avatar URL (from profile or None)
   - Created at timestamp (from profile or None)
8. Return combined dictionary

**Error Handling**:
- If profile not found: Returns partial dict with auth info but null profile fields
- No exception raised - gracefully handles missing profiles

**Response Format**: Matches `MeResponse` Pydantic model from models/auth.py

**Use Case**:
- Called by GET /auth/me endpoint
- Gets current user's profile on app load for dashboard display
- Combines authentication data with profile customizations

**Example Response**:
```json
{
  "id": "user-uuid-123",
  "email": "user@example.com",
  "full_name": "John Doe",
  "avatar_url": "https://cdn.example.com/avatars/john.jpg",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

#### upsert_user_profile()

**Purpose**: Creates or updates (upsert) a user's profile in the database. Handles both new profile creation and existing profile updates.

**Function Signature**:
```python
def upsert_user_profile(user_id: str, full_name: str | None, avatar_url: str | None, supabase: Client) -> dict
```

**Parameters**:
- `user_id: str` - Unique user identifier (UUID)
- `full_name: str | None` - User's full name (optional, can be None for no change)
- `avatar_url: str | None` - URL to avatar image (optional, can be None for no change)
- `supabase: Client` - Supabase client for database operations

**Returns**:
- `dict` - Updated profile data from database matching `ProfileResponse` format:
  - `id: str` - User ID
  - `full_name: Optional[str]` - Updated full name
  - `avatar_url: Optional[str]` - Updated avatar URL
  - `created_at: Optional[datetime]` - Original creation timestamp
  - `updated_at: Optional[datetime]` - Last update timestamp

**Logic Flow**:
1. Create payload dictionary with user_id
2. Check if full_name is provided (not None):
   - If yes: Add to payload
   - If no: Exclude from payload (don't overwrite with None)
3. Check if avatar_url is provided (not None):
   - If yes: Add to payload
   - If no: Exclude from payload (don't overwrite with None)
4. Call Supabase upsert:
   - `.upsert(payload, on_conflict="id")` - Inserts if new, updates if exists
   - Conflict resolution on "id" column (primary key)
5. Execute the query
6. Check if result contains data:
   - If no data: Raise HTTPException with 500 INTERNAL_SERVER_ERROR
   - Error detail: "Failed to update profile"
7. Return first record from result data

**Upsert Behavior**:
- **If profile exists**: Updates only the provided fields (partial update)
- **If profile doesn't exist**: Creates new profile with provided fields
- **Unspecified fields**: Not included in payload, won't be updated
- This allows "patch" behavior - update only what the user provided

**Error Handling**:
- Raises `HTTPException` if upsert fails to return data
- Status code: 500 INTERNAL_SERVER_ERROR
- Message: "Failed to update profile"

**Response Format**: Matches `ProfileResponse` Pydantic model

**Use Case**:
- Called by POST /auth/profile endpoint
- Updates user profile after signup (save full_name)
- Updates profile from Settings page (name and/or avatar)
- Supports partial updates - only provided fields are changed

**Example Request**:
```python
# Update only full_name
upsert_user_profile(
    user_id="user-uuid-123",
    full_name="Jane Doe",
    avatar_url=None,  # Don't update avatar
    supabase=supabase_client
)

# Update both fields
upsert_user_profile(
    user_id="user-uuid-123",
    full_name="John Smith",
    avatar_url="https://cdn.example.com/avatars/john-new.jpg",
    supabase=supabase_client
)
```

**Example Response**:
```json
{
  "id": "user-uuid-123",
  "full_name": "Jane Doe",
  "avatar_url": "https://cdn.example.com/avatars/jane.jpg",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-05-31T18:25:00Z"
}
```

---

## Database Tables Involved

### profiles Table
**Columns**:
- `id` (TEXT, PRIMARY KEY) - User ID, matches auth.users.id
- `full_name` (TEXT, nullable) - User's display name
- `avatar_url` (TEXT, nullable) - URL to avatar image
- `created_at` (TIMESTAMP) - When profile record was created
- `updated_at` (TIMESTAMP) - When profile was last modified

**Relationship**: One-to-one with auth.users (same id)

---

## Integration Points

### Called By
- **Routers**: `backend/app/routers/auth.py`
  - `get_me()` calls `get_user_profile()`
  - `upsert_profile()` calls `upsert_user_profile()`

### Dependencies
- Supabase Client (dependency injection)
- FastAPI HTTP exception utilities

### Response Models
- `MeResponse` from `app.models.auth` - Used by `get_user_profile()`
- `ProfileResponse` from `app.models.auth` - Used by `upsert_user_profile()`

---

## Service Layer Pattern

These functions exemplify the service layer pattern:

**Architecture Flow**:
```
FastAPI Router (auth.py)
    ↓
    Receives HTTP request with JWT
    ↓
    Calls Service Function (profile_service.py)
    ↓
    Service handles database query/update
    ↓
    Returns business logic result (dict)
    ↓
    Router validates with Pydantic model
    ↓
    Returns HTTP response to frontend
```

**Benefits**:
- **Separation of Concerns**: Database logic isolated from HTTP handling
- **Reusability**: Services can be called from multiple routers or scheduled tasks
- **Testability**: Services are pure functions, easy to unit test
- **Maintainability**: Business logic centralized in one place

---

## Summary

The auth services module provides 2 core functions:

1. **get_user_profile()**: Retrieves user profile by fetching from profiles table and merging with auth email
   - Handles missing profiles gracefully
   - Returns combined auth + profile data
   - Used for displaying user info in UI

2. **upsert_user_profile()**: Creates or updates profile with partial update support
   - Only updates provided fields
   - Raises 500 error if update fails
   - Used for profile creation after signup or updates from settings

These lightweight functions delegate to Supabase for actual database operations and follow FastAPI best practices for error handling and data validation.
