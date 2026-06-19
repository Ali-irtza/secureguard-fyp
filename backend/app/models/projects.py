from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ProjectCreateRequest(BaseModel):
    name: str
    language: Optional[str] = None
    type: Literal["personal", "team"] = "personal"
    team_id: Optional[str] = None
    upload_type: Literal["upload", "github"] = "upload"
    github_repo: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Project name cannot be blank")
        if len(cleaned) > 255:
            raise ValueError("Project name cannot exceed 255 characters")
        return cleaned


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    language: Optional[str] = None
    health_score: Optional[int] = None
    type: Optional[Literal["personal", "team"]] = None
    team_id: Optional[str] = None
    github_repo: Optional[str] = None
    upload_type: Optional[Literal["upload", "github"]] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Project name cannot be blank")
        return cleaned


class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=100)


class ProjectResponse(BaseModel):
    id: str
    name: str
    language: Optional[str] = None
    health_score: Optional[int] = None
    type: str
    owner_id: str
    team_id: Optional[str] = None
    upload_type: Optional[str] = None
    github_repo: Optional[str] = None
    github_branches: List[str] = []
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]


class BulkDeleteResponse(BaseModel):
    deleted: int
