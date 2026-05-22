from pydantic import BaseModel, field_validator, Field
from typing import Optional, List, Literal
from datetime import datetime


# ---------------------------------------------------------------------------
# Request Schemas  (frontend → backend)
# ---------------------------------------------------------------------------

class ProjectCreateRequest(BaseModel):
    """
    POST /projects
    Creates a new project owned by the authenticated user.
    """
    name:     str
    language: Optional[str]                    = None
    type:     Literal["personal", "team"]      = "personal"
    team_id:  Optional[str]                    = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Project name cannot be blank")
        if len(v.strip()) > 255:
            raise ValueError("Project name cannot exceed 255 characters")
        return v.strip()


class ProjectUpdateRequest(BaseModel):
    """
    PATCH /projects/{project_id}
    Partial update — all fields optional.
    Covers: rename project, change language, update health score, change type/team.
    """
    name:         Optional[str]                        = None
    language:     Optional[str]                        = None
    health_score: Optional[str]                        = None
    type:         Optional[Literal["personal", "team"]] = None
    team_id:      Optional[str]                        = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Project name cannot be blank")
        return v.strip() if v else v


class BulkDeleteRequest(BaseModel):
    """
    DELETE /projects/bulk-delete
    Delete multiple projects by ID in a single request.
    Only projects owned by the authenticated user will be deleted.
    """
    ids: List[str] = Field(min_length=1, max_length=100)


# ---------------------------------------------------------------------------
# Response Schemas  (backend → frontend)
# ---------------------------------------------------------------------------

class ProjectResponse(BaseModel):
    """
    A single project object returned to the frontend.
    """
    id:           str
    name:         str
    language:     Optional[str]  = None
    health_score: Optional[str]  = None
    type:         str
    owner_id:     str
    team_id:      Optional[str]  = None
    created_at:   datetime
    updated_at:   datetime


class ProjectListResponse(BaseModel):
    """
    Response for GET /projects — list of all projects visible to the user.
    Includes personal projects and projects belonging to the user's teams.
    """
    projects: List[ProjectResponse]


class BulkDeleteResponse(BaseModel):
    """
    Response for DELETE /projects/bulk-delete
    Reports how many projects were actually deleted.
    """
    deleted: int
