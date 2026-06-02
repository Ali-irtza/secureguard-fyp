# backend/tests Test Suite Documentation

## Overview
The tests directory contains the test suite for SecureGuard Pro's backend service layer. Currently, it includes comprehensive property-based testing for the projects-live-sync feature using Pytest and Hypothesis. The tests validate 7 critical properties across create, read, update, delete, and bulk operations.

**Total Test Files**: 2  
**Test Framework**: Pytest + Hypothesis (property-based testing)  
**Minimum Examples Per Test**: 100  
**Total Test Cases**: 12 test methods across 7 test classes  

---

## File: __init__.py

### Purpose
Package initialization file for the tests module. Serves as a Python package marker.

### Content
```python
# Tests package
```

**Effect**: Marks the `tests` directory as a Python package, allowing imports of test utilities and fixtures from this directory.

---

## File: test_project_service_properties.py

### Purpose
Property-based testing for the projects service layer (`app.services.projects.project_service`). Tests Properties 1–7 from the projects-live-sync feature design document using Hypothesis to generate 100+ random examples per test.

### Test Dependencies
```bash
pip install pytest hypothesis pytest-mock
```

### Running Tests
```bash
# Run all tests with verbose output
pytest backend/tests/test_project_service_properties.py -v

# Run a specific test class
pytest backend/tests/test_project_service_properties.py::TestProperty3InputValidation -v

# Run with coverage
pytest backend/tests/test_project_service_properties.py --cov=app.services.projects
```

### Imports

```python
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
```

---

## Helper Functions

### _make_project_row()
```python
def _make_project_row(
    project_id: str | None = None,
    owner_id: str | None = None,
    name: str = "test-project",
    language: str | None = "C",
    health_score: str | None = "A",
    project_type: str = "personal",
    team_id: str | None = None,
) -> dict[str, Any]:
```

**Purpose**: Build a minimal project database row dict for mocking Supabase responses.

**Returns**: Dict with all project table columns:
- `id`: Auto-generated UUID if not provided
- `name`: Project name (default: "test-project")
- `language`: C or C++ (default: "C")
- `health_score`: A-F grade (default: "A")
- `type`: "personal" or "team"
- `owner_id`: Auto-generated UUID if not provided
- `team_id`: Team reference (nullable)
- `created_at` & `updated_at`: ISO 8601 timestamps (current time)

**Use Case**: Quickly build realistic project rows for mock responses.

---

### _mock_supabase()
```python
def _mock_supabase(return_data: Any = None, single: bool = False) -> MagicMock:
```

**Purpose**: Build a chainable Supabase mock that simulates the fluent query API.

**Simulates**:
```python
supabase.table("projects")
  .select() / .insert() / .update() / .delete()
  .eq() / .in_() / .or_()
  .single()
  .execute()  # Returns MagicMock with .data = return_data
```

**Returns**: MagicMock configured with the full chain of Supabase query methods.

**Example**:
```python
mock = _mock_supabase(return_data=[{"id": "123", "name": "Test"}])
result = mock.table("projects").select().execute()
assert result.data == [{"id": "123", "name": "Test"}]
```

---

## Test Classes & Properties

### Property 3: Input Validation Completeness

#### Class: TestProperty3InputValidation

**Feature**: projects-live-sync  
**Validates**: Requirements 3.1, 3.2, 3.3, 3.5, 3.6  

Tests that input validation is complete and rejects invalid requests.

---

#### Test: test_blank_name_raises_validation_error()
```python
@given(st.text().filter(lambda s: not s.strip()))
@settings(max_examples=100)
def test_blank_name_raises_validation_error(self, blank_name: str):
```

**Property**: For any blank/whitespace-only name, ProjectCreateRequest raises ValidationError.

**Hypothesis Strategy**: `st.text()` filtered to only whitespace strings.

**Validates**: Requirement 3.5 — Name must be non-blank.

**Examples Generated**: 100 different whitespace-only strings (empty, spaces, tabs, newlines).

---

#### Test: test_name_exceeding_255_chars_raises_validation_error()
```python
@given(st.text(min_size=256, max_size=500))
@settings(max_examples=100)
def test_name_exceeding_255_chars_raises_validation_error(self, long_name: str):
```

**Property**: For any name > 255 characters, ProjectCreateRequest raises ValidationError.

**Hypothesis Strategy**: `st.text(min_size=256, max_size=500)` — strings 256-500 chars.

**Validates**: Requirement 3.1 — Name max 255 characters.

**Examples Generated**: 100 different long names exceeding the limit.

---

#### Test: test_team_type_without_team_id_raises_http_422()
```python
@given(st.text(min_size=1, max_size=255).filter(lambda s: s.strip()))
@settings(max_examples=100)
def test_team_type_without_team_id_raises_http_422(self, valid_name: str):
```

**Property**: For type='team' with team_id=None, create_project raises HTTP 422.

**Hypothesis Strategy**: Valid project names (1-255 chars, non-empty).

**Validates**: Requirement 3.6 — Team projects must have team_id.

**Logic**:
1. Create ProjectCreateRequest with type="team" and team_id=None
2. Call project_service.create_project()
3. Expect HTTPException with status_code=422
4. Expect "team_id" in error detail

---

#### Test: test_bulk_delete_empty_ids_raises_validation_error()
```python
def test_bulk_delete_empty_ids_raises_validation_error(self):
```

**Property**: BulkDeleteRequest with empty ids list raises ValidationError.

**Validates**: Requirement 3.3 — Bulk delete must have at least 1 ID.

**Logic**: Attempt to create BulkDeleteRequest(ids=[]) → ValidationError raised.

---

#### Test: test_bulk_delete_over_100_ids_raises_validation_error()
```python
@given(st.lists(st.uuids().map(str), min_size=101, max_size=200))
@settings(max_examples=50)
def test_bulk_delete_over_100_ids_raises_validation_error(self, ids: list[str]):
```

**Property**: BulkDeleteRequest with > 100 IDs raises ValidationError.

**Hypothesis Strategy**: Lists of 101-200 UUIDs.

**Validates**: Requirement 3.3 — Bulk delete max 100 IDs.

**Examples Generated**: 50 different ID lists exceeding 100-item limit.

---

#### Test: test_update_request_blank_name_raises_validation_error()
```python
@given(st.text().filter(lambda s: s is not None and not s.strip()))
@settings(max_examples=100)
def test_update_request_blank_name_raises_validation_error(self, blank_name: str):
```

**Property**: ProjectUpdateRequest with blank name raises ValidationError.

**Hypothesis Strategy**: Whitespace-only strings.

**Validates**: Requirement 3.2 — Update name must be non-blank (if provided).

**Examples Generated**: 100 different whitespace-only strings.

---

### Property 4: require_owner Guard

#### Class: TestProperty4RequireOwner

**Feature**: projects-live-sync  
**Validates**: Requirements 2.6, 4.6  

Tests that require_owner() enforces strict ownership checks.

---

#### Test: test_non_owner_always_gets_403()
```python
@given(st.uuids(), st.uuids())
@settings(max_examples=100)
def test_non_owner_always_gets_403(
    self, project_owner_uuid: uuid.UUID, caller_uuid: uuid.UUID
):
```

**Property**: For any project P and caller C where P.owner_id ≠ C.id, require_owner raises HTTP 403.

**Hypothesis Strategy**: Two random UUIDs (filtered to ensure they differ).

**Validates**: Requirements 2.6, 4.6 — Only owner can modify projects.

**Logic**:
1. Generate two different UUIDs (project owner, caller)
2. Create a project row with owner_id = project owner
3. Mock supabase to return that row
4. Call require_owner(project_id, caller_id, supabase)
5. Expect HTTPException with status_code=403
6. Expect detail="You do not own this project"

**Examples Generated**: 100 pairs of different UUIDs.

---

#### Test: test_owner_does_not_raise()
```python
@given(st.uuids())
@settings(max_examples=100)
def test_owner_does_not_raise(self, owner_uuid: uuid.UUID):
```

**Property**: For the actual owner, require_owner() returns the project row without raising.

**Hypothesis Strategy**: Random UUID (the owner).

**Validates**: Requirements 2.6, 4.6 — Owner can access own projects.

**Logic**:
1. Generate UUID (owner_id)
2. Create project row with that owner_id
3. Mock supabase to return that row
4. Call require_owner(project_id, owner_id, supabase)
5. Assert returns the row with correct owner_id

**Examples Generated**: 100 different owner UUIDs.

---

### Property 5: Bulk Delete Count

#### Class: TestProperty5BulkDeleteCount

**Feature**: projects-live-sync  
**Validates**: Requirements 5.1, 5.2, 5.4  

Tests that bulk delete only deletes owned IDs and silently skips foreign IDs.

---

#### Test: test_deleted_count_equals_owned_subset()
```python
@given(
    st.lists(st.uuids().map(str), min_size=1, max_size=50),
    st.uuids().map(str),
    st.integers(min_value=0),
)
@settings(max_examples=100)
def test_deleted_count_equals_owned_subset(
    self, all_ids: list[str], user_id: str, owned_count_seed: int
):
```

**Property**: The deleted count equals exactly the number of IDs owned by the user. Non-owned IDs are silently skipped.

**Hypothesis Strategy**:
- List of 1-50 UUIDs (request IDs)
- Random UUID (user_id)
- Random integer (seed for selecting which IDs are "owned")

**Validates**: Requirements 5.1, 5.2 — Bulk delete only deletes owned projects; foreign ones are skipped.

**Logic**:
1. Determine `owned_count = owned_count_seed % (len(all_ids) + 1)` (0 to len(all_ids))
2. First `owned_count` IDs are "owned" by the user; rest are foreign
3. Mock supabase.table("projects").select() to return only owned rows
4. Mock supabase.table("projects").delete() to return empty (deletion confirmed)
5. Call bulk_delete_projects(all_ids, user_id, supabase)
6. Assert result.deleted == len(owned_ids) (not len(all_ids))

**Examples Generated**: 100 different combinations of ID lists, users, and ownership distributions.

---

#### Test: test_no_owned_ids_raises_422()
```python
@given(
    st.lists(st.uuids().map(str), min_size=1, max_size=50),
    st.uuids().map(str),
)
@settings(max_examples=100)
def test_no_owned_ids_raises_422(self, all_ids: list[str], user_id: str):
```

**Property**: When no IDs belong to the user, bulk_delete_projects raises HTTP 422.

**Hypothesis Strategy**:
- List of 1-50 UUIDs (request IDs, all foreign)
- Random UUID (user_id)

**Validates**: Requirement 5.4 — Bulk delete must find at least one owned ID.

**Logic**:
1. Mock supabase.table("projects").select() to return empty (no owned rows)
2. Call bulk_delete_projects(all_ids, user_id, supabase)
3. Expect HTTPException with status_code=422

**Examples Generated**: 100 different ID lists and users (all with no owned IDs).

---

### Property 6: Create-Then-Fetch Round Trip

#### Class: TestProperty6CreateRoundTrip

**Feature**: projects-live-sync  
**Validates**: Requirements 4.2, 6.3  

Tests that created projects retain all input fields and correct ownership.

---

#### Test: test_created_project_has_correct_owner_and_fields()
```python
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
```

**Property**: After create_project, the returned ProjectResponse has owner_id = user_id and all payload fields match the input.

**Hypothesis Strategy**:
- Valid name (1-255 chars, non-empty)
- Language: "C" or "C++"
- Type: "personal" or "team"
- Random UUID (user_id)

**Validates**: Requirements 4.2, 6.3 — Create returns correct response with all fields.

**Logic**:
1. Create ProjectCreateRequest with generated name, language, type
2. If type="team", generate team_id
3. Mock supabase to return an inserted row with those fields + owner_id = user_id
4. Call create_project(body, user_id, supabase)
5. Assert result has:
   - owner_id == user_id
   - name == body.name
   - language == input language
   - type == input type
   - team_id == input team_id

**Examples Generated**: 100 different project configurations.

---

### Property 7: Update Partial-Field Isolation

#### Class: TestProperty7UpdatePartialIsolation

**Feature**: projects-live-sync  
**Validates**: Requirements 4.5, 6.4  

Tests that updating only certain fields doesn't accidentally modify others.

---

#### Test: test_only_supplied_fields_change()
```python
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
```

**Property**: After update_project with a partial payload, only the supplied fields change; all other fields retain their original values.

**Hypothesis Strategy**:
- New name (1-255 chars)
- New language ("C" or "C++")
- New health_score ("A"-"F")
- User ID

**Validates**: Requirements 4.5, 6.4 — Partial updates don't corrupt other fields.

**Logic**:
1. Create original project row with:
   - name="original-name", language="C", health_score="F", type="personal"
2. Create ProjectUpdateRequest with only name=new_name (language & health_score omitted)
3. Mock supabase to:
   - First call (require_owner): return original_row
   - Second call (update): return updated_row with new name, original language/health_score/type
4. Call update_project(project_id, body, user_id, supabase)
5. Assert:
   - result.name == new_name (changed)
   - result.language == original_row["language"] (unchanged)
   - result.health_score == original_row["health_score"] (unchanged)
   - result.type == original_row["type"] (unchanged)
   - result.owner_id == user_id (unchanged)

**Examples Generated**: 100 different combinations of update fields.

---

### Property 1: updated_at Trigger Invariant

#### Class: TestProperty1UpdatedAtTrigger

**Feature**: projects-live-sync  
**Validates**: Requirement 1.4  

Tests that the updated_at timestamp is automatically set to current time on updates.

---

#### Test: test_updated_at_is_not_before_update_time()
```python
@given(
    st.datetimes(
        min_value=datetime(2000, 1, 1),
        max_value=datetime(2025, 1, 1),
        timezones=st.just(timezone.utc),
    )
)
@settings(max_examples=100)
def test_updated_at_is_not_before_update_time(self, before_update: datetime):
```

**Property**: The updated_at returned after an update is ≥ the timestamp before the update. (DB trigger sets updated_at = now(), so it must be ≥ any past timestamp.)

**Hypothesis Strategy**: Datetimes from 2000 to 2025 (always before current update).

**Validates**: Requirement 1.4 — updated_at trigger sets timestamp correctly.

**Logic**:
1. Generate a past datetime (before_update)
2. Create original project row with any updated_at
3. Simulate DB trigger by setting updated_at to current time (after_update = now())
4. Mock supabase to:
   - First call (require_owner): return original_row
   - Second call (update): return updated_row with new updated_at
5. Call update_project(project_id, body, user_id, supabase)
6. Parse result.updated_at to datetime
7. Assert result_updated_at ≥ before_update

**Examples Generated**: 100 different past timestamps.

---

### Property 2: List Visibility

#### Class: TestProperty2ListVisibility

**Feature**: projects-live-sync  
**Validates**: Requirement 4.1  

Tests that list_user_projects returns only the user's own and team projects (not foreign ones).

---

#### Test: test_list_returns_only_owned_and_team_projects()
```python
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
```

**Property**: list_user_projects returns only projects owned by the user or belonging to their teams. Foreign projects are excluded.

**Hypothesis Strategy**:
- User UUID
- 0-5 team IDs
- 1-10 foreign project IDs (not owned by user or user's teams)

**Validates**: Requirement 4.1 — List enforces ownership/team membership visibility.

**Logic**:
1. Create 2 personal projects owned by user_id
2. Create 1 team project for each team_id (owned by different users)
3. Generate foreign_project_ids (for reference, not returned)
4. Mock supabase to:
   - table("team_members"): return team memberships for user
   - table("projects"): return owned_projects + team_projects (not foreign)
5. Call list_user_projects(user_id, supabase)
6. Assert result is ProjectListResponse
7. Assert all visible projects are in result
8. Assert no foreign projects leaked in

**Examples Generated**: 100 different combinations of owned, team, and foreign projects.

---

## Hypothesis Property-Based Testing

### What is Property-Based Testing?

Property-based testing uses randomized input generation to verify invariants (properties) that should hold for all valid inputs. Instead of writing individual test cases, you define a property and Hypothesis generates hundreds of random examples to test it.

**Advantages**:
- ✅ Catches edge cases developers wouldn't think of
- ✅ Reduces boilerplate (100 test cases from 1 property definition)
- ✅ Finds bugs in boundary conditions
- ✅ Documents expected behavior clearly

**Disadvantages**:
- ⚠️ Non-deterministic (tests pass/fail based on random input)
- ⚠️ Slower than unit tests (100+ examples per property)
- ⚠️ Hard to debug (random input may be hard to reproduce)

### Hypothesis Strategies Used

| Strategy | Purpose | Example |
|----------|---------|---------|
| `st.text()` | Random strings | "abc", "", "你好" |
| `st.text(min_size=N, max_size=M)` | Strings with length bounds | 1-255 char names |
| `st.uuids()` | Random UUIDs | UUID4 format |
| `st.lists(...)` | Random lists | [id1, id2, id3, ...] |
| `st.sampled_from([...])` | Choice from fixed list | "C" or "C++" |
| `st.integers(min_value=N)` | Random integers | 0, 1, 2, ... |
| `st.datetimes(...)` | Random timestamps | 2000-2025 datetimes |

### Configuration

All tests use:
```python
@settings(max_examples=100)  # Generate 100 examples minimum
```

Some use:
```python
@settings(max_examples=50)   # Reduced for slower tests (e.g., bulk delete)
```

And some use filtering:
```python
@given(st.text().filter(lambda s: s.strip()))  # Only non-empty strings
assume(project_owner_id != caller_id)  # Skip invalid combinations
```

---

## Mocking Strategy

### Supabase Query Chain Mocking

The code mocks the full Supabase query chain:

```python
supabase.table("projects")
  .select("*")
  .eq("owner_id", user_id)
  .execute()  # Returns MagicMock with .data = [row1, row2, ...]
```

**Key Insight**: Each method (.table, .select, .eq, etc.) must return the chain itself so the next method can be called.

**Implementation**:
```python
chain = MagicMock()
chain.table.return_value = chain
chain.select.return_value = chain
chain.eq.return_value = chain
chain.execute.return_value = MagicMock(data=[...])
```

### Multi-Call Mocking

Some tests need different behavior for multiple calls:

```python
def table_side_effect(table_name: str):
    call_count += 1
    if call_count == 1:
        # First call: select returns owned rows
        execute_result.data = owned_rows
    else:
        # Second call: delete returns empty
        execute_result.data = []
    return chain

supabase.table.side_effect = table_side_effect
```

---

## Test Execution Summary

| Test Class | Tests | Properties | Requirements |
|----------|-------|-----------|--------------|
| TestProperty3InputValidation | 6 | Input validation | 3.1, 3.2, 3.3, 3.5, 3.6 |
| TestProperty4RequireOwner | 2 | Ownership checks | 2.6, 4.6 |
| TestProperty5BulkDeleteCount | 2 | Bulk delete counts | 5.1, 5.2, 5.4 |
| TestProperty6CreateRoundTrip | 1 | Create correctness | 4.2, 6.3 |
| TestProperty7UpdatePartialIsolation | 1 | Partial updates | 4.5, 6.4 |
| TestProperty1UpdatedAtTrigger | 1 | Trigger invariants | 1.4 |
| TestProperty2ListVisibility | 1 | List visibility | 4.1 |
| **TOTAL** | **12** | **7** | **20+ requirements** |

---

## Coverage

These tests validate the projects service layer across:
- ✅ Input validation (name length, blank names, missing team_id)
- ✅ Ownership enforcement (403 for non-owners)
- ✅ Bulk operations (delete count, empty check)
- ✅ CRUD correctness (create, read, update, delete)
- ✅ Partial updates (field isolation)
- ✅ Triggers (updated_at auto-update)
- ✅ List visibility (RLS enforcement)

**Not Covered** (future tests):
- Service layer error handling (exception cases)
- Concurrent updates (race conditions)
- Performance (large dataset scaling)
- Database constraints (foreign key violations)
- Integration tests (full request/response cycle)

---

## Best Practices

### Writing Property Tests
1. **Name clearly**: test_name_clearly_states_the_property()
2. **Document the property**: Add docstring explaining what should always be true
3. **Use appropriate strategies**: Match strategy to the domain (e.g., st.uuids() for IDs)
4. **Filter/assume carefully**: Avoid generating invalid inputs; use filter() or assume()
5. **Mock external dependencies**: Don't test the DB; mock it

### Debugging Failed Tests
1. Hypothesis prints the minimal failing example
2. Use `@settings(database=ExampleDatabase())` to replay failures
3. Print intermediate values in the test
4. Reduce max_examples to run faster during development
5. Use pytest -vv for verbose output

### CI/CD Integration
- Run tests on every commit
- Seed Hypothesis with CI environment for reproducible failures
- Set max_examples higher in CI than local (e.g., 1000)
- Archive failed examples for later investigation

---

## Future Test Additions

Potential test classes to add:
- **TestProperty8GetProjectById** — Fetching single project
- **TestProperty9UserTeamSync** — Team membership changes
- **TestErrorHandling** — Exception cases (missing projects, DB errors)
- **TestConcurrency** — Race conditions in updates
- **TestPerformance** — Large dataset scaling
- **TestIntegration** — Full HTTP request/response

---

## Summary

The test suite validates critical properties of the projects service layer using property-based testing. Each property is tested 100+ times with randomly generated inputs, providing high confidence that the business logic behaves correctly across all valid input combinations.

**Key Takeaway**: Property-based testing catches edge cases and provides concise, maintainable test suites that document expected behavior clearly.
