from pydantic import BaseModel, EmailStr, field_validator, model_validator
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
        message = v.strip()
        if not message:
            raise ValueError("Message cannot be blank")
        if len(message.splitlines()) > 5:
            raise ValueError("Message cannot be more than 5 lines")
        if len(message) > 2000:
            raise ValueError("Message cannot exceed 2000 characters")
        return message


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

    @model_validator(mode="before")
    @classmethod
    def normalize_contact_id(cls, data):
        if isinstance(data, dict) and "id" not in data and "contact_id" in data:
            return {**data, "id": data["contact_id"]}
        return data

    class Config:
        from_attributes = True  # Allow ORM model conversion
