from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


# ---------------------------------------------------------------------------
# Database disconnected on branch `zunair/new_db`.
# ---------------------------------------------------------------------------
# The old Supabase client creation and JWT verification were removed from this
# branch on purpose. Protected routes now fail explicitly instead of touching the
# old Supabase project while the new database layer is being designed.
# ---------------------------------------------------------------------------


class DisabledSupabaseClient:
    """Shape-compatible placeholder for old service signatures."""

    def table(self, _name: str) -> Any:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is disconnected on branch zunair/new_db.",
        )

    @property
    def auth(self) -> Any:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase auth is disconnected on branch zunair/new_db.",
        )

    @property
    def storage(self) -> Any:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase storage is disconnected on branch zunair/new_db.",
        )


_disabled_supabase_client = DisabledSupabaseClient()


def get_supabase() -> DisabledSupabaseClient:
    return _disabled_supabase_client


bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    _credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Authentication is disconnected on branch zunair/new_db.",
    )
