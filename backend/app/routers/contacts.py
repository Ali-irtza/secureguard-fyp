from fastapi import APIRouter, Depends, status, Query
from supabase import Client

from app.dependencies import get_supabase
from app.models.contacts import ContactCreateRequest, ContactResponse
from app.services.contacts.contact_service import (
    create_contact, get_contact, list_contacts
)

router = APIRouter()


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def submit_contact(
    body: ContactCreateRequest,
    supabase: Client = Depends(get_supabase),
):
    """
    POST /contacts
    
    Submit a contact form from the landing page.
    Anyone can submit — no authentication required.
    
    Args:
        body: Contact form data (name, email, subject, message)
        supabase: Supabase client (auto-injected)
    
    Returns:
        ContactResponse with created contact ID and metadata
    """
    return create_contact(body, supabase)


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact_detail(
    contact_id: str,
    supabase: Client = Depends(get_supabase),
):
    """
    GET /contacts/{contact_id}
    
    Retrieve a specific contact by ID.
    (For now, public access — you can add authentication later if needed)
    
    Args:
        contact_id: UUID of the contact
        supabase: Supabase client (auto-injected)
    
    Returns:
        ContactResponse with full contact details
    """
    return get_contact(contact_id, supabase)


@router.get("", response_model=list[ContactResponse])
async def list_all_contacts(
    status_filter: str = Query(None, description="Filter by status: 'new', 'in-progress', or 'resolved'"),
    supabase: Client = Depends(get_supabase),
):
    """
    GET /contacts
    
    List all contact submissions, optionally filtered by status.
    (For now, public access — you can add admin-only authentication later)
    
    Args:
        status_filter: Optional status filter
        supabase: Supabase client (auto-injected)
    
    Returns:
        List of ContactResponse objects, ordered by newest first
    """
    return list_contacts(status_filter, supabase)
