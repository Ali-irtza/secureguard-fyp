from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.config import settings

# ---------------------------------------------------------------------------
# Supabase Client — module-level singleton
# ---------------------------------------------------------------------------
# Creating a new client per request was causing a fresh TCP + TLS handshake
# on every API call, adding ~1-2 seconds of overhead each time.
# A single shared instance reuses the underlying HTTP connection pool.
# service_role key bypasses RLS so the backend can manage data for any user.
# NEVER expose the service_role key to the frontend.
# ---------------------------------------------------------------------------
_supabase_client: Client | None = None

def get_supabase() -> Client:
    """
    Returns the shared Supabase client singleton.
    Initialised once on first call; reused for every subsequent request.
    """
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _supabase_client


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
# HTTPBearer reads the Authorization header from incoming requests.
# Format expected: Authorization: Bearer <jwt_token>
# The frontend sends this header with every protected request.
# ---------------------------------------------------------------------------
bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    supabase: Client = Depends(get_supabase),
) -> dict:
    """
    Validates the JWT token sent by the frontend.
    
    How it works:
    1. Frontend logs in via Supabase Auth → gets a JWT token
    2. Frontend sends that token in every request header
    3. This function asks Supabase to verify the token
    4. If valid → returns the user data
    5. If invalid/expired → raises 401 Unauthorized (request is blocked)
    
    Any route that needs authentication just adds:
        current_user: dict = Depends(get_current_user)
    That's it. Auth handled automatically.
    """
    token = credentials.credentials

    try:
        # Ask Supabase to verify the token and return the user
        response = supabase.auth.get_user(token)

        if response is None or response.user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        return response.user

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
