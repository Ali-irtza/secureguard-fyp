from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


# ---------------------------------------------------------------------------
# Allowed file extensions per project language
# ---------------------------------------------------------------------------
# C projects  : .c, .h
# C++ projects: .cpp, .cxx, .cc, .hpp, .hxx, .h
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS: dict[str, list[str]] = {
    "C":   [".c", ".h"],
    "C++": [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".h"],
}

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB per file

# Source tag values stored as object metadata in Supabase Storage
FILE_SOURCE_LOCAL  = "local"
FILE_SOURCE_GITHUB = "github"


# ---------------------------------------------------------------------------
# Request Schemas  (frontend → backend)
# ---------------------------------------------------------------------------

class GitHubImportRequest(BaseModel):
    """
    POST /projects/{id}/files/github-import
    Import a single file from the team's connected GitHub repository.
    The caller must be an admin or developer with access to the given branch.
    """
    branch:    str   # branch to import from
    file_path: str   # path within the repo, e.g. "src/main.c"


# ---------------------------------------------------------------------------
# Response Schemas  (backend → frontend)
# ---------------------------------------------------------------------------

class ProjectFileResponse(BaseModel):
    """
    Metadata for a single file stored in Supabase Storage.
    The `url` field is a short-lived signed URL for direct download.
    `source` indicates whether the file was uploaded locally or imported from GitHub.
    `uploaded_by` is the user ID of whoever added the file.
    """
    id:            str
    name:          str
    size:          int                              # bytes
    content_type:  str
    path:          str                              # storage path: {project_id}/{filename}
    url:           str                              # signed download URL (valid 1 hour)
    uploaded_at:   datetime
    uploaded_by:   Optional[str]               = None  # user_id
    source:        Literal["local", "github"]  = "local"
    github_branch: Optional[str]               = None  # set only when source == "github"


class ProjectFileListResponse(BaseModel):
    """Response for GET /projects/{id}/files"""
    files: List[ProjectFileResponse]


class ProjectSourceFile(BaseModel):
    name: str
    content: str


class ProjectSourceFilesResponse(BaseModel):
    files: List[ProjectSourceFile]


class ProjectFileDeleteResponse(BaseModel):
    """Response for DELETE /projects/{id}/files/{filename}"""
    deleted: str  # filename that was removed
