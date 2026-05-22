from fastapi import APIRouter, Depends
from supabase import Client
from app.dependencies import get_supabase, get_current_user
from app.models.auth import MeResponse, ProfileUpdateRequest, ProfileResponse
from app.services.auth.profile_service import get_user_profile, upsert_user_profile

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
# Returns the current user's profile data.
# Frontend calls this on load to populate the dashboard header (name, avatar).
# Requires a valid JWT in the Authorization header.
# ---------------------------------------------------------------------------
@router.get("/me", response_model=MeResponse)
async def get_me(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns the authenticated user's profile.
    Merges auth.users data (email) with profiles table data (name, avatar).
    """
    profile_data = get_user_profile(
        user_id=current_user.id, 
        email=current_user.email, 
        supabase=supabase
    )
    return MeResponse(**profile_data)


# ---------------------------------------------------------------------------
# POST /auth/profile
# ---------------------------------------------------------------------------
# Creates or updates the current user's profile.
# Called after signup (to save full_name) or from the Settings page.
# Uses upsert so it works for both new and existing profiles.
# ---------------------------------------------------------------------------
@router.post("/profile", response_model=ProfileResponse)
async def upsert_profile(
    body: ProfileUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Upserts the authenticated user's profile.
    Only updates fields that are provided (non-None).
    """
    profile_data = upsert_user_profile(
        user_id=current_user.id,
        full_name=body.full_name,
        avatar_url=body.avatar_url,
        supabase=supabase
    )
    return ProfileResponse(**profile_data)
