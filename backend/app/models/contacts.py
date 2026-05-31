from pydantic import BaseModel, EmailStr, field_validator
from typing import Literal
from datetime import datetime


# ---------------------------------------------------------------------------
# Request Schemas (frontend → backend)
# ---------------------------------------------------------------------------

class ContactCreateRequest(BaseModel):
    """
    POST /contacts
    Submits a contact form from the landing page.
    Anyone can submit — no authentication required.
    """
    name: str
    email: EmailStr  # Auto-validates email format
    subject: str
    message: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank")
        if len(v.strip()) > 255:
            raise ValueError("Name cannot exceed 255 characters")
        return v.strip()

    @field_validator("subject")
    @classmethod
    def subject_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Subject cannot be blank")
        if len(v.strip()) > 255:
            raise ValueError("Subject cannot exceed 255 characters")
        return v.strip()

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message cannot be blank")
        if len(v.strip()) > 10000:
            raise ValueError("Message cannot exceed 10000 characters")
        return v.strip()


# ---------------------------------------------------------------------------
# Response Schemas (backend → frontend)
# ---------------------------------------------------------------------------

class ContactResponse(BaseModel):
    """
    Response when contact is successfully created.
    Includes the contact ID and metadata.
    """
    id: str
    name: str
    email: str
    subject: str
    message: str
    status: Literal["new", "in-progress", "resolved"]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Allow ORM model conversion
