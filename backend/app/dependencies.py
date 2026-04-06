from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.config import settings

# ---------------------------------------------------------------------------
# Supabase Client
# ---------------------------------------------------------------------------
# We create ONE client instance for the whole app.
# service_role key is used here because the backend needs to bypass
# Row Level Security (RLS) to manage data on behalf of users.
# NEVER expose the service_role key to the frontend.
# ---------------------------------------------------------------------------
def get_supabase() -> Client:
    """
    Returns a Supabase client instance.
    Used as a FastAPI dependency — injected into routes that need DB access.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


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
