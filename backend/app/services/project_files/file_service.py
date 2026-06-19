import hashlib
import io
import os
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath

from fastapi import HTTPException, UploadFile, status
from supabase import Client

from app.models.project_files import (
    FILE_SOURCE_LOCAL,
    GitHubImportRequest,
    ProjectFileDeleteResponse,
    ProjectFileListResponse,
    ProjectFileResponse,
    ProjectSourceFile,
    ProjectSourceFilesResponse,
)
from app.services.teams.team_service import require_member

STORAGE_BUCKET = "project-files"
SIGNED_URL_EXPIRY_SECONDS = 3600
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
C_CPP_EXTENSIONS = {".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hxx"}
NO_SOURCE_FILES_MESSAGE = (
    "This ZIP does not contain any C or C++ source files. "
    "Please upload a ZIP with .c, .cpp, .h, .hpp, .cc, .cxx, or .hxx files."
)


def _extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lower()


def _language_from_filename(filename: str) -> str:
    ext = _extension(filename)
    if ext in {".cpp", ".cc", ".cxx", ".hpp", ".hxx"}:
        return "C++"
    return "C"


def _combined_language(existing: str | None, new_languages: set[str]) -> str | None:
    languages = set(new_languages)
    if existing == "C":
        languages.add("C")
    if existing == "C++":
        languages.add("C++")
    if existing == "C, C++":
        languages.update({"C", "C++"})
    if "C" in languages and "C++" in languages:
        return "C, C++"
    if "C++" in languages:
        return "C++"
    if "C" in languages:
        return "C"
    return existing


def _safe_relative_path(filename: str) -> str:
    normalized = filename.replace("\\", "/").strip().lstrip("/")
    parts = PurePosixPath(normalized).parts
    if (
        not normalized
        or normalized.startswith("../")
        or "/../" in normalized
        or normalized.endswith("/..")
        or normalized.startswith("./")
        or "/./" in normalized
        or normalized.endswith("/.")
        or any(part in {"", ".", ".."} for part in parts)
        or (len(normalized) > 1 and normalized[1] == ":")
        or any(ord(char) < 32 for char in normalized)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Suspicious file name found: {filename}. Rename the file and upload it again.",
        )
    return normalized


def _require_project(project_id: str, user_id: str, supabase: Client) -> dict:
    result = (
        supabase.table("projects")
        .select("*")
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if result.data["user_id"] != user_id:
        if result.data.get("project_type") == "team":
            team_result = (
                supabase.table("team")
                .select("team_id")
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
            team = (team_result.data or [None])[0]
            if team:
                require_member(team["team_id"], user_id, supabase)
                return result.data
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this project")
    return result.data


def _storage_path(user_id: str, project_id: str, file_id: str, relative_path: str) -> str:
    return f"users/{user_id}/projects/{project_id}/files/{file_id}/{relative_path}"


def _find_active_duplicate(
    project_id: str,
    user_id: str,
    relative_path: str,
    digest: str,
    supabase: Client,
) -> dict | None:
    result = (
        supabase.table("project_files")
        .select("*")
        .eq("project_id", project_id)
        .eq("uploaded_by", user_id)
        .eq("file_names", relative_path)
        .eq("sha256", digest)
        .eq("is_active", True)
        .neq("file_path", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _make_signed_url(storage_path: str, supabase: Client) -> str:
    if storage_path.startswith("github://"):
        return ""
    signed = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(
        storage_path,
        SIGNED_URL_EXPIRY_SECONDS,
    )
    return signed.get("signedURL") or signed.get("signed_url") or ""


def _upload_bytes(storage_path: str, content: bytes, content_type: str, supabase: Client) -> None:
    supabase.storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        content,
        file_options={
            "content-type": content_type,
            "upsert": "true",
            "x-upsert": "true",
        },
    )


def _row_to_response(row: dict, supabase: Client) -> ProjectFileResponse:
    raw_ts = row.get("created_at") or ""
    try:
        uploaded_at = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
    except ValueError:
        uploaded_at = datetime.now(timezone.utc)

    return ProjectFileResponse(
        id=row["project_files_id"],
        name=row["file_names"],
        size=row["file_size"],
        content_type=row["content_type"],
        path=row["file_path"],
        url=_make_signed_url(row["file_path"], supabase),
        uploaded_at=uploaded_at,
        uploaded_by=row.get("uploaded_by"),
        source="github" if str(row.get("file_path") or "").startswith("github://") else FILE_SOURCE_LOCAL,
        github_branch=row.get("github_branch"),
    )


def _insert_file_row(
    project_id: str,
    user_id: str,
    relative_path: str,
    content: bytes,
    content_type: str,
    supabase: Client,
) -> dict:
    digest = hashlib.sha256(content).hexdigest()
    duplicate = _find_active_duplicate(project_id, user_id, relative_path, digest, supabase)
    if duplicate:
        return duplicate

    placeholder = {
        "project_id": project_id,
        "uploaded_by": user_id,
        "file_names": relative_path,
        "file_path": "pending",
        "file_size": len(content),
        "content_type": content_type,
        "sha256": digest,
        "is_active": True,
    }
    created = supabase.table("project_files").insert(placeholder).execute()
    if not created.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file metadata.",
        )

    row = created.data[0]
    storage_path = _storage_path(user_id, project_id, row["project_files_id"], relative_path)
    _upload_bytes(storage_path, content, content_type, supabase)

    updated = (
        supabase.table("project_files")
        .update({"file_path": storage_path})
        .eq("project_files_id", row["project_files_id"])
        .execute()
    )
    if not updated.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to finalize file metadata.",
        )
    return updated.data[0]


def _update_project_language(project: dict, languages: set[str], supabase: Client) -> None:
    next_language = _combined_language(project.get("project_language"), languages)
    if next_language and next_language != project.get("project_language"):
        (
            supabase.table("projects")
            .update({"project_language": next_language})
            .eq("project_id", project["project_id"])
            .execute()
        )


def _extract_upload(upload: UploadFile, content: bytes) -> list[tuple[str, bytes, str]]:
    filename = _safe_relative_path((upload.filename or "").strip())
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot upload an empty file")
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 10 MB size limit ({len(content):,} bytes uploaded)",
        )

    ext = _extension(filename)
    if ext == ".zip":
        extracted: list[tuple[str, bytes, str]] = []
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                for entry in archive.infolist():
                    if entry.is_dir():
                        continue
                    inner_name = _safe_relative_path(entry.filename)
                    if _extension(inner_name) not in C_CPP_EXTENSIONS:
                        continue
                    inner_content = archive.read(entry)
                    if not inner_content:
                        continue
                    if len(inner_content) > MAX_FILE_SIZE_BYTES:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"File exceeds the 10 MB size limit: {inner_name}",
                        )
                    extracted.append((inner_name, inner_content, "text/plain; charset=utf-8"))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid ZIP archive")
        if not extracted:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NO_SOURCE_FILES_MESSAGE)
        return extracted

    if ext not in C_CPP_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please upload a C/C++ source file or a ZIP archive containing C/C++ source files.",
        )
    return [(filename, content, upload.content_type or "text/plain; charset=utf-8")]


def list_project_files(project_id: str, user_id: str, supabase: Client) -> ProjectFileListResponse:
    _require_project(project_id, user_id, supabase)
    result = (
        supabase.table("project_files")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )
    return ProjectFileListResponse(files=[_row_to_response(row, supabase) for row in (result.data or [])])


def list_project_source_files(
    project_id: str,
    user_id: str,
    supabase: Client,
    file_ids: list[str] | None = None,
) -> ProjectSourceFilesResponse:
    _require_project(project_id, user_id, supabase)
    query = (
        supabase.table("project_files")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
    )
    if file_ids:
        query = query.in_("project_files_id", file_ids)

    result = query.execute()
    source_files: list[ProjectSourceFile] = []
    for row in result.data or []:
        try:
            content = supabase.storage.from_(STORAGE_BUCKET).download(row["file_path"])
        except Exception:
            continue
        source_files.append(
            ProjectSourceFile(
                name=row["file_names"],
                content=content.decode("utf-8", errors="replace"),
            )
        )

    if not source_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No C/C++ source files were found for this project.",
        )
    return ProjectSourceFilesResponse(files=source_files)


def save_scanned_sources_zip(
    project_id: str,
    user_id: str,
    files_dict: dict[str, str],
    supabase: Client,
) -> list[dict]:
    if not project_id or not files_dict:
        return []
    project = _require_project(project_id, user_id, supabase)
    rows: list[dict] = []
    languages: set[str] = set()
    for file_path, source_code in files_dict.items():
        relative_path = _safe_relative_path(file_path)
        content = source_code.encode("utf-8")
        rows.append(
            _insert_file_row(
                project_id,
                user_id,
                relative_path,
                content,
                "text/plain; charset=utf-8",
                supabase,
            )
        )
        languages.add(_language_from_filename(relative_path))
    _update_project_language(project, languages, supabase)
    return rows


def save_github_source_metadata(
    project_id: str,
    user_id: str,
    repo_full_name: str,
    branch: str,
    files_dict: dict[str, str],
    supabase: Client,
) -> list[dict]:
    if not files_dict:
        return []
    project = _require_project(project_id, user_id, supabase)
    rows: list[dict] = []
    languages: set[str] = set()

    for file_path, source_code in files_dict.items():
        relative_path = _safe_relative_path(file_path)
        digest = hashlib.sha256(source_code.encode("utf-8")).hexdigest()
        duplicate = _find_active_duplicate(project_id, user_id, relative_path, digest, supabase)
        if duplicate:
            rows.append(duplicate)
        else:
            github_path = f"github://{repo_full_name}/{branch}/{relative_path}"
            inserted = (
                supabase.table("project_files")
                .insert(
                    {
                        "project_id": project_id,
                        "uploaded_by": user_id,
                        "file_names": relative_path,
                        "file_path": github_path,
                        "file_size": len(source_code.encode("utf-8")),
                        "content_type": "text/plain; charset=utf-8",
                        "github_branch": branch,
                        "sha256": digest,
                        "is_active": True,
                    }
                )
                .execute()
            )
            if not inserted.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to save GitHub file metadata.",
                )
            rows.append(inserted.data[0])
        languages.add(_language_from_filename(relative_path))

    _update_project_language(project, languages, supabase)
    return rows


async def upload_project_file(
    project_id: str,
    user_id: str,
    file: UploadFile,
    supabase: Client,
) -> ProjectFileResponse:
    project = _require_project(project_id, user_id, supabase)
    content = await file.read()
    extracted = _extract_upload(file, content)
    rows: list[dict] = []
    languages: set[str] = set()

    for relative_path, source_bytes, content_type in extracted:
        rows.append(
            _insert_file_row(
                project_id,
                user_id,
                relative_path,
                source_bytes,
                content_type,
                supabase,
            )
        )
        languages.add(_language_from_filename(relative_path))

    _update_project_language(project, languages, supabase)
    return _row_to_response(rows[0], supabase)


async def import_github_file(
    project_id: str,
    user_id: str,
    body: GitHubImportRequest,
    supabase: Client,
) -> ProjectFileResponse:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="GitHub file import is not enabled in this step.",
    )


def delete_project_file(
    project_id: str,
    filename: str,
    user_id: str,
    supabase: Client,
) -> ProjectFileDeleteResponse:
    _require_project(project_id, user_id, supabase)
    result = (
        supabase.table("project_files")
        .select("*")
        .eq("project_id", project_id)
        .eq("file_names", filename)
        .eq("is_active", True)
        .execute()
    )
    rows = result.data or []
    for row in rows:
        try:
            supabase.storage.from_(STORAGE_BUCKET).remove([row["file_path"]])
        except Exception:
            pass
        (
            supabase.table("project_files")
            .update({"is_active": False})
            .eq("project_files_id", row["project_files_id"])
            .execute()
        )
    return ProjectFileDeleteResponse(deleted=filename)
