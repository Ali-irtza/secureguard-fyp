from fastapi import HTTPException, status
from supabase import Client

def get_user_profile(user_id: str, email: str, supabase: Client) -> dict:
    """
    Fetches the user's profile and returns a dictionary matching MeResponse format.
    """
    result = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    profile = result.data or {}
    
    return {
        "id": user_id,
        "email": email,
        "full_name": profile.get("full_name"),
        "avatar_url": profile.get("avatar_url"),
        "created_at": profile.get("created_at"),
    }

def upsert_user_profile(user_id: str, full_name: str | None, avatar_url: str | None, supabase: Client) -> dict:
    """
    Upserts the user's profile and returns a dictionary matching ProfileResponse format.
    """
    payload: dict = {"id": user_id}
    if full_name is not None:
        payload["full_name"] = full_name
    if avatar_url is not None:
        payload["avatar_url"] = avatar_url

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

    return result.data[0]
