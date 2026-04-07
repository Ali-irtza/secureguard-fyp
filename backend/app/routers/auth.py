from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
from app.dependencies import get_supabase, get_current_user
from app.models.auth import MeResponse, ProfileUpdateRequest, ProfileResponse

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
    user_id = current_user.id

    # Fetch profile row from our profiles table
    result = supabase.table("profiles").select("*").eq("id", user_id).single().execute()

    profile = result.data or {}

    return MeResponse(
        id=user_id,
        email=current_user.email,
        full_name=profile.get("full_name"),
        avatar_url=profile.get("avatar_url"),
        created_at=profile.get("created_at"),
    )


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
    user_id = current_user.id

    # Build update payload — only include fields the client actually sent
    payload: dict = {"id": user_id}
    if body.full_name is not None:
        payload["full_name"] = body.full_name
    if body.avatar_url is not None:
        payload["avatar_url"] = body.avatar_url

    result = (
        supabase.table("profiles")
        .upsert(payload, on_conflict="id")
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile",
        )

    return ProfileResponse(**result.data[0])
