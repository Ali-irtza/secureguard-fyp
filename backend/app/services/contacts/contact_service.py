from fastapi import HTTPException, status
from supabase import Client
from app.models.contacts import ContactCreateRequest, ContactResponse
from datetime import datetime
from typing import Optional


def _profile_exists_for_email(email: str, supabase: Client) -> bool:
    normalized_email = email.strip().lower()
    for user_id_column in ("user_id", "id"):
        try:
            result = (
                supabase.table("profiles")
                .select(user_id_column)
                .ilike("email", normalized_email)
                .limit(1)
                .execute()
            )
            return bool(result.data)
        except Exception:
            continue
    return False


def _contact_id_column(supabase: Client) -> str:
    try:
        supabase.table("contacts").select("contact_id").limit(1).execute()
        return "contact_id"
    except Exception:
        return "id"


def create_contact(
    request: ContactCreateRequest,
    supabase: Client
) -> ContactResponse:
    """
    Creates a new contact submission in the database.
    
    Args:
        request: Contact form data from frontend
        supabase: Supabase client instance
    
    Returns:
        ContactResponse with created contact details
    
    Raises:
        HTTPException: If database insert fails
    """
    try:
        if not _profile_exists_for_email(str(request.email), supabase):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This email is not registered with SecureGuard.",
            )

        result = (
            supabase.table("contacts")
            .insert({
                "name": request.name,
                "email": str(request.email).strip().lower(),
                "subject": request.subject,
                "message": request.message,
                "status": "new",
            })
            .execute()
        )
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create contact submission",
            )
        
        contact_data = result.data[0]
        return ContactResponse(**contact_data)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )


def get_contact(
    contact_id: str,
    supabase: Client
) -> ContactResponse:
    """
    Retrieves a single contact by ID.
    
    Args:
        contact_id: UUID of the contact
        supabase: Supabase client instance
    
    Returns:
        ContactResponse with contact details
    
    Raises:
        HTTPException: If contact not found or database error
    """
    try:
        id_column = _contact_id_column(supabase)
        result = (
            supabase.table("contacts")
            .select("*")
            .eq(id_column, contact_id)
            .single()
            .execute()
        )
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found",
            )
        
        return ContactResponse(**result.data)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )


def list_contacts(
    status_filter: Optional[str] = None,
    supabase: Client = None
) -> list[ContactResponse]:
    """
    Lists all contacts, optionally filtered by status.
    
    Args:
        status_filter: Optional status to filter by ('new', 'in-progress', 'resolved')
        supabase: Supabase client instance
    
    Returns:
        List of ContactResponse objects
    
    Raises:
        HTTPException: If database query fails
    """
    try:
        query = supabase.table("contacts").select("*")
        
        if status_filter:
            query = query.eq("status", status_filter)
        
        result = query.order("created_at", desc=True).execute()
        
        return [ContactResponse(**contact) for contact in (result.data or [])]
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
