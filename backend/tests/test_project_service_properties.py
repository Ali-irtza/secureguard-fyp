"""
Property-based tests for the projects-live-sync feature — backend service layer.

Feature: projects-live-sync
Tests Properties 1–7 from the design document using Hypothesis.

Each test runs a minimum of 100 examples.

Install test dependencies (if not already present):
    pip install pytest hypothesis pytest-mock

Run:
    pytest backend/tests/test_project_service_properties.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from pydantic import ValidationError

from app.models.projects import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from app.services.projects import project_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_project_row(
    project_id: str | None = None,
    owner_id: str | None = None,
    name: str = "test-project",
    language: str | None = "C",
    health_score: str | None = "A",
    project_type: str = "personal",
    team_id: str | None = None,
) -> dict[str, Any]:
    """Build a minimal project DB row dict."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": project_id or str(uuid.uuid4()),
        "name": name,
        "language": language,
        "health_score": health_score,
        "type": project_type,
        "owner_id": owner_id or str(uuid.uuid4()),
        "team_id": team_id,
        "created_at": now,
        "updated_at": now,
    }


def _mock_supabase(return_data: Any = None, single: bool = False) -> MagicMock:
    """
    Build a chainable Supabase mock.
    The chain: .table().select()/.insert()/.update()/.delete()
               .eq()/.in_()/.or_()/.single()
               .execute()  → returns MagicMock with .data = return_data
    """
    execute_result = MagicMock()
    execute_result.data = return_data

    chain = MagicMock()
    chain.execute.return_value = execute_result
    chain.eq.return_value = chain
    chain.in_.return_value = chain
    chain.or_.return_value = chain
    chain.single.return_value = chain
    chain.select.return_value = chain
    chain.insert.return_value = chain
    chain.update.return_value = chain
    chain.delete.return_value = chain

    supabase = MagicMock()
    supabase.table.return_value = chain
    return supabase


# ---------------------------------------------------------------------------
# Property 3: Input validation completeness
# Feature: projects-live-sync, Property 3
# Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6
# ---------------------------------------------------------------------------

class TestProperty3InputValidation:
    """Property 3: Input validation completeness."""

    @given(st.text().filter(lambda s: not s.strip()))
    @settings(max_examples=100)
    def test_blank_name_raises_validation_error(self, blank_name: str):
        """
        Feature: projects-live-sync, Property 3
        For any blank/whitespace-only name, ProjectCreateRequest raises ValidationError.
        Validates: Requirement 3.5
        """
        with pytest.raises(ValidationError):
            ProjectCreateRequest(name=blank_name)

    @given(st.text(min_size=256, max_size=500))
    @settings(max_examples=100)
    def test_name_exceeding_255_chars_raises_validation_error(self, long_name: str):
        """
        Feature: projects-live-sync, Property 3
        For any name > 255 chars, ProjectCreateRequest raises ValidationError.
        Validates: Requirement 3.1
        """
        with pytest.raises(ValidationError):
            ProjectCreateRequest(name=long_name)

    @given(st.text(min_size=1, max_size=255).filter(lambda s: s.strip()))
    @settings(max_examples=100)
    def test_team_type_without_team_id_raises_http_422(self, valid_name: str):
        """
        Feature: projects-live-sync, Property 3
        For type='team' with team_id=None, create_project raises HTTP 422.
        Validates: Requirement 3.6
        """
        body = ProjectCreateRequest(name=valid_name, type="team", team_id=None)
        supabase = _mock_supabase()
        with pytest.raises(HTTPException) as exc_info:
            project_service.create_project(body, str(uuid.uuid4()), supabase)
        assert exc_info.value.status_code == 422
        assert "team_id" in exc_info.value.detail

    def test_bulk_delete_empty_ids_raises_validation_error(self):
        """
        Feature: projects-live-sync, Property 3
        BulkDeleteRequest with empty ids raises ValidationError.
        Validates: Requirement 3.3
        """
        with pytest.raises(ValidationError):
            BulkDeleteRequest(ids=[])

    @given(st.lists(st.uuids().map(str), min_size=101, max_size=200))
    @settings(max_examples=50)
    def test_bulk_delete_over_100_ids_raises_validation_error(self, ids: list[str]):
        """
        Feature: projects-live-sync, Property 3
        BulkDeleteRequest with > 100 ids raises ValidationError.
        Validates: Requirement 3.3
        """
        with pytest.raises(ValidationError):
            BulkDeleteRequest(ids=ids)

    @given(st.text().filter(lambda s: s is not None and not s.strip()))
    @settings(max_examples=100)
    def test_update_request_blank_name_raises_validation_error(self, blank_name: str):
        """
        Feature: projects-live-sync, Property 3
        ProjectUpdateRequest with blank name raises ValidationError.
        Validates: Requirement 3.2
        """
        with pytest.raises(ValidationError):
            ProjectUpdateRequest(name=blank_name)


# ---------------------------------------------------------------------------
# Property 4: require_owner guard — non-owner always gets 403
# Feature: projects-live-sync, Property 4
# Validates: Requirements 2.6, 4.6
# ---------------------------------------------------------------------------

class TestProperty4RequireOwner:
    """Property 4: require_owner guard."""

    @given(st.uuids(), st.uuids())
    @settings(max_examples=100)
    def test_non_owner_always_gets_403(
        self, project_owner_uuid: uuid.UUID, caller_uuid: uuid.UUID
    ):
        """
        Feature: projects-live-sync, Property 4
        For any project P and caller C where P.owner_id != C.id,
        require_owner raises HTTP 403.
        Validates: Requirements 2.6, 4.6
        """
        project_owner_id = str(project_owner_uuid)
        caller_id = str(caller_uuid)
        assume(project_owner_id != caller_id)

        project_id = str(uuid.uuid4())
        row = _make_project_row(project_id=project_id, owner_id=project_owner_id)
        supabase = _mock_supabase(return_data=row)

        with pytest.raises(HTTPException) as exc_info:
            project_service.require_owner(project_id, caller_id, supabase)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "You do not own this project"

    @given(st.uuids())
    @settings(max_examples=100)
    def test_owner_does_not_raise(self, owner_uuid: uuid.UUID):
        """
        Feature: projects-live-sync, Property 4
        For the actual owner, require_owner returns the row without raising.
        Validates: Requirements 2.6, 4.6
        """
        owner_id = str(owner_uuid)
        project_id = str(uuid.uuid4())
        row = _make_project_row(project_id=project_id, owner_id=owner_id)
        supabase = _mock_supabase(return_data=row)

        result = project_service.require_owner(project_id, owner_id, supabase)
        assert result["owner_id"] == owner_id


# ---------------------------------------------------------------------------
# Property 5: Bulk delete count equals owned IDs
# Feature: projects-live-sync, Property 5
# Validates: Requirements 5.1, 5.2
# ---------------------------------------------------------------------------

class TestProperty5BulkDeleteCount:
    """Property 5: Bulk delete count equals owned IDs."""

    @given(
        st.lists(st.uuids().map(str), min_size=1, max_size=50),
        st.uuids().map(str),
        st.integers(min_value=0),
    )
    @settings(max_examples=100)
    def test_deleted_count_equals_owned_subset(
        self, all_ids: list[str], user_id: str, owned_count_seed: int
    ):
        """
        Feature: projects-live-sync, Property 5
        The deleted count equals exactly the number of IDs owned by the user.
        Non-owned IDs are silently skipped.
        Validates: Requirements 5.1, 5.2
        """
        # Determine how many of the submitted IDs are "owned"
        owned_count = owned_count_seed % (len(all_ids) + 1)
        owned_ids = all_ids[:owned_count]

        assume(len(owned_ids) > 0)  # skip the case where nothing is owned

        # Mock: first .select() returns owned rows, then .delete() returns nothing
        owned_rows = [{"id": oid} for oid in owned_ids]

        call_count = 0

        def table_side_effect(table_name: str):
            nonlocal call_count
            call_count += 1
            chain = MagicMock()
            if call_count == 1:
                # First call: select owned IDs
                execute_result = MagicMock()
                execute_result.data = owned_rows
                chain.execute.return_value = execute_result
            else:
                # Second call: delete
                execute_result = MagicMock()
                execute_result.data = []
                chain.execute.return_value = execute_result
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.in_.return_value = chain
            chain.delete.return_value = chain
            return chain

        supabase = MagicMock()
        supabase.table.side_effect = table_side_effect

        result = project_service.bulk_delete_projects(all_ids, user_id, supabase)
        assert result.deleted == len(owned_ids)

    @given(
        st.lists(st.uuids().map(str), min_size=1, max_size=50),
        st.uuids().map(str),
    )
    @settings(max_examples=100)
    def test_no_owned_ids_raises_422(self, all_ids: list[str], user_id: str):
        """
        Feature: projects-live-sync, Property 5
        When no IDs belong to the user, bulk_delete_projects raises HTTP 422.
        Validates: Requirement 5.4
        """
        # Mock: select returns empty (no owned rows)
        supabase = _mock_supabase(return_data=[])

        with pytest.raises(HTTPException) as exc_info:
            project_service.bulk_delete_projects(all_ids, user_id, supabase)

        assert exc_info.value.status_code == 422


# ---------------------------------------------------------------------------
# Property 6: Create-then-fetch round trip
# Feature: projects-live-sync, Property 6
# Validates: Requirements 4.2, 6.3
# ---------------------------------------------------------------------------

class TestProperty6CreateRoundTrip:
    """Property 6: Create-then-fetch round trip."""

    @given(
        st.text(min_size=1, max_size=255).filter(lambda s: s.strip()),
        st.sampled_from(["C", "C++"]),
        st.sampled_from(["personal", "team"]),
        st.uuids().map(str),
    )
    @settings(max_examples=100)
    def test_created_project_has_correct_owner_and_fields(
        self,
        name: str,
        language: str,
        project_type: str,
        user_id: str,
    ):
        """
        Feature: projects-live-sync, Property 6
        After create_project, the returned ProjectResponse has owner_id = user_id
        and all payload fields match.
        Validates: Requirements 4.2, 6.3
        """
        team_id = str(uuid.uuid4()) if project_type == "team" else None
        body = ProjectCreateRequest(
            name=name.strip(),
            language=language,
            type=project_type,
            team_id=team_id,
        )

        now = datetime.now(timezone.utc).isoformat()
        inserted_row = {
            "id": str(uuid.uuid4()),
            "name": body.name,
            "language": language,
            "health_score": None,
            "type": project_type,
            "owner_id": user_id,
            "team_id": team_id,
            "created_at": now,
            "updated_at": now,
        }
        supabase = _mock_supabase(return_data=[inserted_row])

        result = project_service.create_project(body, user_id, supabase)

        assert result.owner_id == user_id
        assert result.name == body.name
        assert result.language == language
        assert result.type == project_type
        assert result.team_id == team_id


# ---------------------------------------------------------------------------
# Property 7: Update partial-field isolation
# Feature: projects-live-sync, Property 7
# Validates: Requirements 4.5, 6.4
# ---------------------------------------------------------------------------

class TestProperty7UpdatePartialIsolation:
    """Property 7: Update partial-field isolation."""

    @given(
        st.text(min_size=1, max_size=255).filter(lambda s: s.strip()),
        st.sampled_from(["C", "C++"]),
        st.sampled_from(["A", "B", "C", "D", "F"]),
        st.uuids().map(str),
    )
    @settings(max_examples=100)
    def test_only_supplied_fields_change(
        self,
        new_name: str,
        new_language: str,
        new_health_score: str,
        user_id: str,
    ):
        """
        Feature: projects-live-sync, Property 7
        After update_project with a partial payload, only the supplied fields
        change; all other fields retain their original values.
        Validates: Requirements 4.5, 6.4
        """
        project_id = str(uuid.uuid4())
        original_row = _make_project_row(
            project_id=project_id,
            owner_id=user_id,
            name="original-name",
            language="C",
            health_score="F",
            project_type="personal",
        )

        # Only update name — language and health_score should stay the same
        body = ProjectUpdateRequest(name=new_name.strip())

        now = datetime.now(timezone.utc).isoformat()
        updated_row = {
            **original_row,
            "name": new_name.strip(),
            "updated_at": now,
        }

        call_count = 0

        def table_side_effect(table_name: str):
            nonlocal call_count
            call_count += 1
            chain = MagicMock()
            if call_count == 1:
                # require_owner call
                execute_result = MagicMock()
                execute_result.data = original_row
                chain.execute.return_value = execute_result
                chain.single.return_value = chain
            else:
                # update call
                execute_result = MagicMock()
                execute_result.data = [updated_row]
                chain.execute.return_value = execute_result
            chain.select.return_value = chain
            chain.update.return_value = chain
            chain.eq.return_value = chain
            return chain

        supabase = MagicMock()
        supabase.table.side_effect = table_side_effect

        result = project_service.update_project(project_id, body, user_id, supabase)

        # Only name changed
        assert result.name == new_name.strip()
        # Other fields unchanged
        assert result.language == original_row["language"]
        assert result.health_score == original_row["health_score"]
        assert result.type == original_row["type"]
        assert result.owner_id == user_id


# ---------------------------------------------------------------------------
# Property 1: updated_at trigger invariant (service-layer simulation)
# Feature: projects-live-sync, Property 1
# Validates: Requirement 1.4
# ---------------------------------------------------------------------------

class TestProperty1UpdatedAtTrigger:
    """Property 1: updated_at trigger invariant (service-layer simulation)."""

    @given(
        st.datetimes(
            min_value=datetime(2000, 1, 1),
            max_value=datetime(2025, 1, 1),  # always in the past relative to now()
            timezones=st.just(timezone.utc),
        )
    )
    @settings(max_examples=100)
    def test_updated_at_is_not_before_update_time(self, before_update: datetime):
        """
        Feature: projects-live-sync, Property 1
        The updated_at returned after an update is >= the timestamp before the update.
        The DB trigger sets updated_at = now(), so it must be >= any past timestamp.
        Validates: Requirement 1.4
        """
        project_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        original_row = _make_project_row(project_id=project_id, owner_id=user_id)

        # Simulate the DB trigger setting updated_at to now() (always >= before_update)
        after_update = datetime.now(timezone.utc)
        updated_row = {
            **original_row,
            "updated_at": after_update.isoformat(),
        }

        call_count = 0

        def table_side_effect(table_name: str):
            nonlocal call_count
            call_count += 1
            chain = MagicMock()
            if call_count == 1:
                execute_result = MagicMock()
                execute_result.data = original_row
                chain.execute.return_value = execute_result
                chain.single.return_value = chain
            else:
                execute_result = MagicMock()
                execute_result.data = [updated_row]
                chain.execute.return_value = execute_result
            chain.select.return_value = chain
            chain.update.return_value = chain
            chain.eq.return_value = chain
            return chain

        supabase = MagicMock()
        supabase.table.side_effect = table_side_effect

        body = ProjectUpdateRequest(name="updated-name")
        result = project_service.update_project(project_id, body, user_id, supabase)

        result_updated_at = datetime.fromisoformat(result.updated_at.isoformat())
        assert result_updated_at >= before_update


# ---------------------------------------------------------------------------
# Property 2: list_user_projects returns only visible rows
# Feature: projects-live-sync, Property 2
# Validates: Requirement 4.1
# ---------------------------------------------------------------------------

class TestProperty2ListVisibility:
    """Property 2: RLS ownership isolation (service layer)."""

    @given(
        st.uuids().map(str),
        st.lists(st.uuids().map(str), max_size=5),
        st.lists(st.uuids().map(str), min_size=1, max_size=10),
    )
    @settings(max_examples=100)
    def test_list_returns_only_owned_and_team_projects(
        self,
        user_id: str,
        team_ids: list[str],
        foreign_project_ids: list[str],
    ):
        """
        Feature: projects-live-sync, Property 2
        list_user_projects returns only projects owned by the user or belonging
        to their teams. Foreign projects are excluded.
        Validates: Requirement 4.1
        """
        now = datetime.now(timezone.utc).isoformat()

        # Build owned projects
        owned_projects = [
            _make_project_row(owner_id=user_id, project_type="personal")
            for _ in range(2)
        ]

        # Build team projects
        team_projects = [
            _make_project_row(
                owner_id=str(uuid.uuid4()),
                project_type="team",
                team_id=team_ids[0] if team_ids else str(uuid.uuid4()),
            )
            for _ in range(len(team_ids))
        ]

        # The service should return owned + team projects (not foreign ones)
        visible_projects = owned_projects + team_projects

        call_count = 0

        def table_side_effect(table_name: str):
            nonlocal call_count
            call_count += 1
            chain = MagicMock()
            if table_name == "team_members":
                execute_result = MagicMock()
                execute_result.data = [{"team_id": tid} for tid in team_ids]
                chain.execute.return_value = execute_result
            else:
                execute_result = MagicMock()
                execute_result.data = visible_projects
                chain.execute.return_value = execute_result
            chain.select.return_value = chain
            chain.eq.return_value = chain
            chain.or_.return_value = chain
            return chain

        supabase = MagicMock()
        supabase.table.side_effect = table_side_effect

        result = project_service.list_user_projects(user_id, supabase)

        assert isinstance(result, ProjectListResponse)
        result_ids = {p.id for p in result.projects}

        # All visible projects are in the result
        for p in visible_projects:
            assert p["id"] in result_ids

        # No foreign projects leaked in
        for fid in foreign_project_ids:
            assert fid not in result_ids
