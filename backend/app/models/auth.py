from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ---------------------------------------------------------------------------
# Request Schemas (what the frontend sends to us)
# ---------------------------------------------------------------------------

class ProfileUpdateRequest(BaseModel):
    """
    Payload for POST /auth/profile
    All fields optional — partial updates are allowed.
    """
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Response Schemas (what we send back to the frontend)
# ---------------------------------------------------------------------------

class ProfileResponse(BaseModel):
    """
    Represents a user profile row from the profiles table.
    """
    id: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MeResponse(BaseModel):
    """
    Response for GET /auth/me
    Combines Supabase auth user data with our profiles table data.
    """
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
