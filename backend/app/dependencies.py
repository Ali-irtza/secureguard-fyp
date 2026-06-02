import httpx
import httpcore

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from postgrest import SyncPostgrestClient
from postgrest.base_request_builder import SyncClient as PostgrestSyncClient
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
SUPABASE_TRANSPORT_EXCEPTIONS = (
    httpx.RemoteProtocolError,
    httpcore.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.TimeoutException,
)


class Http1PostgrestClient(SyncPostgrestClient):
    """PostgREST client that avoids flaky Supabase HTTP/2 stream resets."""

    def create_session(
        self,
        base_url: str,
        headers: dict[str, str],
        timeout: int | float | httpx.Timeout,
        verify: bool = True,
        proxy: str | None = None,
    ) -> PostgrestSyncClient:
        return PostgrestSyncClient(
            base_url=base_url,
            headers=headers,
            timeout=timeout,
            verify=verify,
            proxy=proxy,
            follow_redirects=True,
            http2=False,
        )


def _create_supabase_client() -> Client:
    """Create a shared Supabase client with an HTTP/1.1 PostgREST transport.

    postgrest-py 0.18 hardcodes http2=True, which can surface as
    httpx.RemoteProtocolError when Supabase closes an HTTP/2 stream.
    """
    client = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    client._postgrest = Http1PostgrestClient(
        client.rest_url,
        headers=client.options.headers,
        schema=client.options.schema,
        timeout=client.options.postgrest_client_timeout,
    )
    return client

def get_supabase() -> Client:
    """
    Returns the shared Supabase client singleton.
    Initialised once on first call; reused for every subsequent request.
    """
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = _create_supabase_client()
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

    except SUPABASE_TRANSPORT_EXCEPTIONS as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable. Please retry.",
        ) from exc
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
