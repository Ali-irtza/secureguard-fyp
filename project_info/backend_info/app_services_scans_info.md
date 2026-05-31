# Backend App Services Scans Documentation

This document provides comprehensive information about the security scanning services defined in `backend/app/services/scans`. These services handle vulnerability detection in C/C++ code using AI-powered analysis, AST parsing, and CWE-based vulnerability definitions.

---

## Directory Structure

```
backend/app/services/scans/
├── __init__.py                  # Package initialization
├── scanner_service.py           # GitHub/file fetching and orchestration
├── ai_scanner.py                # LLM-based vulnerability scanning
├── ast_parser.py                # C/C++ code parsing into functions
├── cwe_definitions.py           # 26 CWE vulnerability definitions
└── scan_storage_service.py      # Database operations for scan results
```

---

## cwe_definitions.py

### Purpose
Defines the 26 Common Weakness Enumeration (CWE) vulnerabilities scanned for in C/C++ code. Provides a formatted string for LLM prompts.

### Imports
- `List, Dict` from `typing` - Type hints

### Constants

#### CWE_LIST
A Python list of 26 CWE dictionaries representing target vulnerabilities. Each entry contains:
- `id` - CWE identifier (e.g., "CWE-20")
- `name` - Vulnerability name
- `description` - Detailed vulnerability description
- `severity` - Risk level (Critical, High, Medium)

**The 26 CWEs Covered**:

| ID | Name | Severity |
|---|---|---|
| CWE-20 | Improper Input Validation | High |
| CWE-118 | Out-of-bounds Access | High |
| CWE-119 | Memory Buffer Error | Critical |
| CWE-120 | Classic Buffer Overflow | Critical |
| CWE-121 | Stack-based Buffer Overflow | Critical |
| CWE-122 | Heap-based Buffer Overflow | Critical |
| CWE-125 | Out-of-bounds Read | High |
| CWE-127 | Buffer Under-read | High |
| CWE-134 | Format String Vulnerability | Critical |
| CWE-170 | Improper Null Termination | High |
| CWE-190 | Integer Overflow | High |
| CWE-191 | Integer Underflow | High |
| CWE-193 | Off-by-one Error | High |
| CWE-362 | Race Condition (TOCTOU) | Medium |
| CWE-401 | Memory Leak | Medium |
| CWE-415 | Double Free | Critical |
| CWE-416 | Use After Free | Critical |
| CWE-457 | Use of Uninitialized Variable | High |
| CWE-476 | NULL Pointer Dereference | High |
| CWE-665 | Improper Initialization | Medium |
| CWE-680 | Integer Overflow to Buffer Overflow | Critical |
| CWE-763 | Invalid Pointer Release | Critical |
| CWE-787 | Out-of-bounds Write | Critical |
| CWE-806 | Buffer Access Using Source Size | High |
| CWE-824 | Access of Uninitialized Pointer | Critical |
| CWE-843 | Type Confusion | Critical |

### Functions

#### get_cwe_prompt_text()
- **Purpose**: Format CWE list as text for LLM system prompt
- **Returns**: String with formatted list of all 26 CWEs
- **Format**: 
  ```
  Scan ONLY for these 26 CWE vulnerabilities relevant to C/C++:
  - CWE-XX (Severity): Name — Description
  - ...
  ```
- **Use Case**: Used in `ai_scanner.py` to build LLM system prompt

---

## ast_parser.py

### Purpose
Parses C/C++ source code and splits it into individual functions using regex pattern matching and brace tracking. Used to analyze code at function granularity for better vulnerability scanning.

### Imports
- `re` - Regular expression module
- `dataclass` from `dataclasses` - Create data classes
- `List` from `typing` - Type hints

### Data Classes

#### CodeChunk
Represents a single extracted code unit (function or whole file).

**Attributes**:
- `name: str` - Function name, or "global"/"full_file" for non-function code
- `code: str` - The actual source code of this chunk
- `start_line: int` - Line number where chunk starts (1-indexed)
- `end_line: int` - Line number where chunk ends (1-indexed)

### Constants

#### _FUNC_PATTERN
```python
_FUNC_PATTERN = re.compile(
    r'^[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*\{',
    re.MULTILINE
)
```
- **Purpose**: Matches C/C++ function signatures at the start of a line
- **Captures**: Function name in group 1
- **Pattern Breakdown**:
  - `^[\w\s\*]+` - Return type (word chars, spaces, pointers)
  - `\s+(\w+)` - One or more spaces, then function name (captured)
  - `\s*\(` - Optional spaces, opening parenthesis
  - `[^)]*` - Any parameters inside parentheses
  - `\)\s*\{` - Closing paren, optional spaces, opening brace
  - `re.MULTILINE` - ^ matches line start, not just string start

### Functions

#### _find_closing_brace(source, open_pos)
- **Purpose**: Find the matching closing brace for an opening brace at position open_pos
- **Parameters**:
  - `source` - Full source code string
  - `open_pos` - Index of opening brace character
- **Logic**:
  1. Initialize depth counter to 0
  2. Start at open_pos and iterate forward
  3. Increment depth for each `{`
  4. Decrement depth for each `}`
  5. Return position when depth reaches 0
- **Returns**: Index of matching closing brace, or -1 if unmatched
- **Time Complexity**: O(n) where n is chars from open_pos to end
- **Error Handling**: Returns -1 for unmatched braces (skipped by caller)

#### _line_of(source, pos)
- **Purpose**: Get 1-indexed line number for character position
- **Logic**: Count newline characters before position, add 1
- **Parameters**:
  - `source` - Full source code
  - `pos` - Character position (0-indexed)
- **Returns**: Line number (1-indexed)

#### extract_chunks(source_code)
- **Purpose**: Parse C/C++ source into list of CodeChunk objects (one per function)
- **Flow**:
  1. Use regex to find all function signatures
  2. For each match:
     - Extract function name from regex group 1
     - Find opening brace position
     - Find matching closing brace via `_find_closing_brace()`
     - Skip if braces unmatched
     - Extract chunk code from match start to closing brace
     - Skip if chunk has < 2 newlines (too small)
     - Calculate start_line and end_line
     - Append to chunks list
  3. If no functions found: Create single "full_file" chunk for entire code
  4. Return list of chunks
- **Returns**: `List[CodeChunk]`
- **Chunk Selection Logic**:
  - Only includes functions with significant code (at least 2 newlines)
  - Skips single-line functions or declarations
  - Falls back to full file if no functions detected
- **Error Handling**:
  - Silently skips unmatched braces
  - Gracefully handles files with no functions
- **Use Case**: Called by `ai_scanner.py` to prepare code for LLM scanning

---

## ai_scanner.py

### Purpose
Sends C/C++ code to FreeLLMAPI (LLM service) for AI-powered vulnerability detection. Coordinates with AST parser to scan functions individually and aggregates results.

### Imports
- `json` - JSON encoding/decoding
- `Dict, List` from `typing` - Type hints
- `httpx` - Async HTTP client
- `CodeChunk, extract_chunks` from `app.services.scans.ast_parser`
- `get_cwe_prompt_text` from `app.services.scans.cwe_definitions`
- `settings` from `app.config`

### Constants

#### FREELLMAPI_URL
```python
FREELLMAPI_URL: str = getattr(settings, "freellmapi_url", "http://localhost:3001/v1")
```
- LLM API endpoint URL (configurable, defaults to localhost)

#### FREELLMAPI_KEY
```python
FREELLMAPI_KEY: str = getattr(settings, "freellmapi_key", "")
```
- Bearer token for authenticating to LLM API

#### SYSTEM_PROMPT
- System prompt sent to LLM with every request
- Includes all 26 CWE definitions from `get_cwe_prompt_text()`
- Enforces strict response format (JSON only)
- Instructs LLM to only report defined vulnerabilities

### Functions

#### build_user_prompt(chunk)
- **Purpose**: Build per-chunk user prompt for LLM
- **Parameters**: `chunk` - CodeChunk object
- **Returns**: Formatted string prompt with function name, line info, and code
- **Prompt Content**:
  - Function name
  - Line number where function starts
  - Raw code
  - Expected JSON response format
  - Example empty response
- **Use Case**: Creates the actual scanning request for each code chunk

#### clean_json_response(text)
- **Purpose**: Remove markdown code fences from LLM response
- **Logic**:
  1. Strip leading/trailing whitespace
  2. Check if starts with ` ``` `
  3. If yes: Remove first 3 chars, check for "json" language tag, remove closing fence
  4. If no: Return as-is (plain JSON)
- **Handles**:
  - ` ```json\n{...}\n``` `
  - ` ```\n{...}\n``` `
  - Plain JSON
- **Returns**: Clean JSON string ready for parsing
- **Error Handling**: Gracefully handles various formats

#### async scan_chunk(chunk, client)
- **Purpose**: Send single CodeChunk to LLM and return vulnerabilities
- **Parameters**:
  - `chunk` - CodeChunk to scan
  - `client` - httpx.AsyncClient for HTTP requests
- **API Request**:
  - **URL**: `{FREELLMAPI_URL}/chat/completions`
  - **Method**: POST
  - **Headers**: 
    - Authorization: Bearer token
    - Content-Type: application/json
  - **Body**: 
    - model: "auto"
    - temperature: 0.1 (low randomness)
    - messages: system + user prompts
- **Response Processing**:
  1. Parse JSON response
  2. Extract message content from choices[0]
  3. Clean markdown code fences
  4. Parse JSON result
  5. Get vulnerabilities array
  6. Enrich each with function_name and absolute_line
  7. Return list of vulnerability dicts
- **Returns**: List of vulnerability dictionaries
- **Error Handling**: Returns empty list if scan fails
- **Timeout**: 60 seconds per request

#### async scan_file(source_code)
- **Purpose**: Orchestrate complete file scanning - parse into chunks, scan each, aggregate results
- **Flow**:
  1. Parse source code into chunks via `extract_chunks()`
  2. Create async HTTP client
  3. For each chunk: Call `scan_chunk()` asynchronously
  4. Collect all vulnerabilities
  5. Calculate risk score (Critical:10, High:7, Medium:4)
  6. Determine risk level based on score
  7. Return aggregated report
- **Returns**: Dictionary with total_vulnerabilities, risk_score, risk_level, chunks_scanned, vulnerabilities array
- **Use Case**: Called by `scanner_service.run_vulnerability_scanner()` for each file

---

## scanner_service.py

### Purpose
High-level scanning orchestration service. Fetches code from GitHub, coordinates with AI scanner, and manages file selection. Handles both small batches (concurrent API) and large batches (zipball).

### Imports
- `httpx` - Async HTTP client
- `asyncio` - Async utilities
- `io` - BytesIO for in-memory buffers
- `zipfile` - ZIP archive handling
- `base64` - Base64 encoding/decoding
- `HTTPException, status` from `fastapi`
- `Client` from `supabase`
- `List, Dict` from `typing`

### Constants

#### GITHUB_API
```python
GITHUB_API = "https://api.github.com"
```
- GitHub REST API base URL

#### C_CPP_EXTENSIONS
```python
C_CPP_EXTENSIONS = ('.c', '.cpp', '.h', '.hpp', '.cc', '.cxx', '.hxx')
```
- File extensions to recognize as C/C++ source files

### Functions

#### _get_token_for_team(team_id, supabase)
- **Purpose**: Get fresh GitHub App installation token for a team
- **Logic**:
  1. Query teams table for github_installation_id
  2. Check if installation_id exists
  3. Call `_get_installation_token()` to get OAuth token
  4. Return token
- **Returns**: Bearer token string
- **Raises**: 400 BAD_REQUEST if no GitHub App installed
- **Used By**: Other functions that need GitHub API access

#### async fetch_branch_files(team_id, branch_name, user_id, supabase)
- **Purpose**: Get list of all C/C++ files in a GitHub branch
- **Access Control**: Validates user is team member
- **Flow**:
  1. Verify team membership
  2. Fetch team's GitHub repo URL
  3. Parse owner/repo from URL
  4. Get installation token
  5. Call GitHub Git Tree API with recursive=1
  6. Filter results to only C/C++ extensions
  7. Return list of file paths
- **Returns**: `List[str]` of C/C++ file paths
- **Error Handling**: 400/403/502 errors as appropriate
- **Use Case**: Frontend calls to populate file picker for scanning

#### async _fetch_blob_content(client, owner, repo, file_path, headers)
- **Purpose**: Fetch single file content from GitHub via Contents API
- **GitHub API Call**: `GET /repos/{owner}/{repo}/contents/{file_path}`
- **Logic**:
  1. Make GET request to Contents API
  2. Check response status
  3. If 200: Extract base64 content, decode to UTF-8
  4. Return (file_path, decoded_content)
  5. If not 200: Return (file_path, "")
- **Returns**: Tuple of (file_path, content_string)
- **Used By**: `fetch_selected_code_hybrid()` for small file batches

#### async fetch_selected_code_hybrid(team_id, branch_name, selected_files, user_id, supabase)
- **Purpose**: Intelligently fetch selected files - chooses method based on count
- **Strategy**:
  - **< 50 files**: Concurrent blob API requests (faster for small batches)
  - **≥ 50 files**: Download zipball, extract in memory (faster for large batches)
- **Flow for Blob Approach (< 50 files)**:
  1. Create async tasks for each file: `_fetch_blob_content()`
  2. Execute all concurrently via `asyncio.gather()`
  3. Collect results into dict
- **Flow for Zipball Approach (≥ 50 files)**:
  1. Call GitHub Zipball API
  2. Download entire ZIP into memory
  3. Extract ZIP file
  4. Strip first path component (GitHub root folder)
  5. Extract only selected files
  6. Decode content
- **Returns**: `Dict[str, str]` mapping {file_path: source_code}
- **Error Handling**: 400/403/502 as appropriate
- **Use Case**: Fetch code for vulnerability scanning

#### async run_vulnerability_scanner(files_dict)
- **Purpose**: AI-powered multi-file scanner orchestration
- **Parameters**: `files_dict` - {file_path: source_code}
- **Flow**:
  1. For each file: Call `scan_file()` from ai_scanner
  2. Tag vulnerabilities with file_path
  3. Aggregate all results
  4. Calculate overall risk score and level
  5. Build comprehensive report
- **Returns**: Dictionary with status, total_vulnerabilities, overall_risk_level, overall_risk_score, files_analyzed, total_chunks_scanned, files_summary, vulnerabilities array
- **Error Handling**: File-level errors logged, don't stop overall scan
- **Use Case**: Called by routers to perform security scans

---

## scan_storage_service.py

### Purpose
Database operations for persisting scan results and vulnerabilities to Supabase. Handles creation of scan records, saving vulnerabilities, and retrieval operations.

### Imports
- `Client` from `supabase` - Database client
- `Dict, List` from `typing`
- `datetime, timezone` from `datetime`

### Database Tables

#### scans Table
**Columns**:
- `id` (UUID, PRIMARY KEY)
- `project_id` (FK to projects)
- `user_id` (FK to users)
- `status` (VARCHAR) - Always "completed"
- `project_name`, `scan_type`, `file_name`, `file_path`, `branch`
- `risk_level`, `risk_score`, `total_vulns`, `files_scanned`, `duration_secs`
- `started_at`, `completed_at`, `created_at` (TIMESTAMP)

#### vulnerabilities Table
**Columns**:
- `id` (UUID, PRIMARY KEY)
- `scan_id` (FK to scans)
- `severity`, `type`, `cwe_id`, `cwe_name`
- `line_number`, `absolute_line`
- `description`, `fix_suggestion`
- `function_name`, `file_path`, `code_snippet`
- `created_at` (TIMESTAMP)

### Functions

#### create_scan_record(supabase, user_id, project_id, scan_data)
- **Purpose**: Insert new scan record into database
- **Parameters**:
  - `scan_data` - Dict with project_name, scan_type, overall_risk_level, overall_risk_score, total_vulnerabilities, files_analyzed, duration_secs
- **Database Operation**: INSERT into scans table
- **Returns**: Scan ID (UUID string) from inserted row
- **Use Case**: Called after vulnerability scanning completes

#### save_vulnerabilities(supabase, scan_id, vulnerabilities)
- **Purpose**: Batch-insert vulnerabilities for a scan
- **Parameters**:
  - `scan_id` - Parent scan ID
  - `vulnerabilities` - List of vulnerability dicts from scanner
- **Flow**:
  1. If vulnerabilities empty: Return early
  2. Transform each vulnerability dict into database row
  3. Batch-insert all rows
- **Database Operation**: INSERT into vulnerabilities table (batch)
- **Use Case**: Called after scan to save all findings

#### get_scans_for_user(supabase, user_id, limit=50)
- **Purpose**: Fetch recent scans for authenticated user
- **Flow**:
  1. Query scans WHERE user_id = ?
  2. Order by created_at DESC
  3. Limit to N results
- **Returns**: `List[Dict]` of scan records
- **Use Case**: Display scan history/list in UI

#### get_scan_with_vulnerabilities(supabase, scan_id, user_id)
- **Purpose**: Fetch single scan with all its vulnerabilities
- **Access Control**: Only returns if user_id matches scan owner
- **Flow**:
  1. Query scan WHERE id = ? AND user_id = ?
  2. Query vulnerabilities WHERE scan_id = ?
  3. Return both in dict
- **Returns**: Dictionary with scan and vulnerabilities array
- **Error Handling**: Raises ValueError if scan not found
- **Use Case**: Display detailed scan results

---

## Summary

The scans service provides AI-powered C/C++ security vulnerability detection with 6 core components:

1. **cwe_definitions.py** - 26 CWE vulnerability definitions for LLM
2. **ast_parser.py** - Parse code into functions for granular scanning
3. **ai_scanner.py** - LLM-based vulnerability detection per function
4. **scanner_service.py** - Fetch code from GitHub, orchestrate scanning
5. **scan_storage_service.py** - Save results to database

Implements sophisticated architecture combining AST parsing, LLM analysis, GitHub integration, and comprehensive vulnerability reporting.
