# Current Scan and Model Flow

This document describes the current implementation found in this repository for the flow:

`New Scan -> create/select project -> upload/select file -> start scan -> model analysis -> save scan -> show results`

It is based on the current code, not the intended design.

## Main Files Involved

Frontend:

- `frontend/src/pages/NewScan.tsx`
- `frontend/src/lib/projects-api.ts`
- `frontend/src/lib/project-files-api.ts`
- `frontend/src/lib/scans-api.ts`

Backend:

- `backend/app/main.py`
- `backend/app/routers/projects.py`
- `backend/app/routers/project_files.py`
- `backend/app/routers/scans.py`
- `backend/app/services/projects/project_service.py`
- `backend/app/services/project_files/file_service.py`
- `backend/app/services/scans/scanner_service.py`
- `backend/app/services/scans/scan_storage_service.py`
- `backend/app/services/model_scanner/graph_runner.py`
- `backend/app/services/model_scanner/static_analyzer.py`
- `backend/app/services/model_scanner/semantic_chunker.py`

There is also a separate standalone LangGraph implementation under `new/main.py`. That file is not wired into the FastAPI scan route. The app currently uses `backend/app/services/model_scanner/graph_runner.py`.

## Backend Route Registration

`backend/app/main.py` registers:

- `/projects` using `projects.router`
- `/projects/{project_id}/files` using `project_files.router`
- `/teams/{team_id}/scans` using `scans.router`
- `/scan/upload`
- `/scan/upload-files`
- `/scans/history`
- `/scans/{scan_id}`
- `/scans/{scan_id}/report-pdf`

The scan router is included twice:

- with prefix `/teams`, for team GitHub scanning
- with prefix `""`, for upload scan/history/report endpoints

## Frontend Flow: New Scan Page

The New Scan page is implemented in `frontend/src/pages/NewScan.tsx`.

### 1. Initial Data Loading

When the page loads, it fetches:

- Projects using `listProjects()`
- Teams using `listTeams()`
- Team details for the selected project if the project belongs to a team
- Existing project files using `listProjectFiles(projectId)` when a real project is selected

Project listing is cached in `frontend/src/lib/projects-api.ts` with a one-hour in-memory TTL. It is invalidated after project mutations and through a Supabase realtime subscription on the `projects` table.

### 2. User Selects Personal or Team Mode

The page supports two scan modes:

- `personal`
- `team`

For team mode, the frontend checks the current user's team role:

- `admin` and `developer` can scan
- `viewer` cannot start scans

Team mode also enables the GitHub import tab.

### 3. User Selects Existing Project or Creates New Project

The project selector supports:

- selecting an existing personal/team project
- selecting `Create new project`, represented internally as `__new__`

When `__new__` is selected, the user enters a new project name. The project is not created immediately. It is created when the user clicks `Start Security Analysis`.

Before creating a project, the frontend validates that the project name starts with a letter.

The frontend detects project language from the first uploaded source file:

- `.c` or `.h` -> `C`
- `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hxx` -> `C++`

That detected language is sent to the backend during project creation.

### 4. Project Creation API

The frontend calls:

```http
POST /projects
```

From `frontend/src/lib/projects-api.ts`:

```ts
createProject({
  name,
  type,
  language,
  team_id,
})
```

The backend route is `backend/app/routers/projects.py`.

The backend service is `backend/app/services/projects/project_service.py`.

Current behavior:

- Personal projects are created with `owner_id = current_user.id`.
- Team projects require `team_id`.
- Only team admins can create team projects.
- Developers and viewers cannot create team projects.
- The project row is inserted into the `projects` table.

## File Upload and Project File Storage Flow

There are two different upload-related behaviors:

1. Save files into a project.
2. Send files to the scanner.

These are separate operations.

### 1. Saving Uploaded Files to a Project

If a project is selected or created, the frontend shows a `Save to project` checkbox per uploaded file. By default, files are saved unless the user unchecks the box.

For each checked uploaded file, the frontend calls:

```http
POST /projects/{project_id}/files
```

The frontend implementation is `uploadProjectFile()` in `frontend/src/lib/project-files-api.ts`.

The backend route is `backend/app/routers/project_files.py`.

The backend service is `backend/app/services/project_files/file_service.py`.

Current behavior:

- The backend verifies project access.
- Personal project files require the owner.
- Team project file access allows owner, team admin, or team developer.
- Viewer access is denied.
- The file must not be empty.
- Max file size is 10 MB.
- File extension must match the project language.
- ZIP uploads are supported.
- ZIP contents are unpacked.
- Only files allowed by the project language are stored.
- File bytes are uploaded to Supabase Storage bucket `project-files`.
- Metadata is upserted into the `project_files` table using conflict key `(project_id, filename)`.
- Listing project files returns fresh one-hour signed URLs.

Important: saving a file to the project is not the same as scanning it. The scan request is made separately after this upload step.

### 2. Existing Project Files

When a project is selected, the frontend calls:

```http
GET /projects/{project_id}/files
```

The returned files include signed download URLs. The frontend displays them with checkboxes. By default, all existing project files are selected.

During scan preparation, the frontend fetches selected existing project file content from those signed URLs and adds the text to a local `filesToScan` list.

## Start Scan Flow: Upload Tab

The main frontend function is `handleStartScan()` in `frontend/src/pages/NewScan.tsx`.

When the user clicks `Start Security Analysis`:

1. UI state resets:
   - `isScanning = true`
   - previous result cleared
   - previous error cleared
   - logs reset
   - progress phase reset

2. If the selected project is `__new__`, the frontend creates the project first.

3. If uploaded files are marked `Save to project`, the frontend uploads them to:

   ```http
   POST /projects/{project_id}/files
   ```

4. The frontend builds `filesToScan` from:
   - selected existing project files
   - newly uploaded non-ZIP files

5. The frontend initializes the code viewer using the first file's source text.

6. The frontend starts visual-only progress:
   - logs such as preparing source package and collecting static evidence
   - line-by-line animation in the code viewer
   - elapsed timer

7. The frontend sends the real scan request.

### Current Upload Scan Request Path

If there are newly uploaded files, the frontend uses multipart upload:

```http
POST /scan/upload-files
```

Implemented in `triggerUploadedFileScan()` in `frontend/src/lib/scans-api.ts`.

The request sends:

- `files`: all uploaded files
- `project_id`
- `project_name`

Important current behavior:

- If any newly uploaded files exist, the frontend scans `uploadedFiles` through `/scan/upload-files`.
- In that branch, selected existing project files that were loaded into `filesToScan` are used for the frontend preview, but they are not included in the `/scan/upload-files` FormData unless they are also in `uploadedFiles`.
- If no newly uploaded files exist, the frontend scans each selected existing project file one by one through:

  ```http
  POST /scan/upload
  ```

  using JSON with `filename`, `source_code`, `project_id`, and `project_name`.

### ZIP Upload Scan Behavior

For `/scan/upload-files`, the backend route `_extract_upload_files()`:

- accepts `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hxx`
- accepts `.zip`
- unpacks ZIP files in memory
- scans only C/C++ files inside ZIP
- rejects unsupported files
- raises HTTP 422 if no C/C++ source files are found

## Start Scan Flow: GitHub Tab

For team GitHub scanning, the frontend first fetches available branch files:

```http
GET /teams/{team_id}/github/files?branch={branch}
```

The backend:

- verifies team membership
- reads the team's connected GitHub repo
- gets a GitHub installation token
- fetches the recursive Git tree
- filters to C/C++ extensions

When the scan starts from GitHub mode, the frontend calls:

```http
POST /teams/{team_id}/scans
```

Body:

```json
{
  "branch": "main",
  "selected_files": ["path/to/file.c"],
  "project_id": "...",
  "project_name": "..."
}
```

The backend fetches selected code with `fetch_selected_code_hybrid()`:

- if fewer than 50 files are selected, it fetches contents concurrently through GitHub Contents API
- if 50 or more files are selected, it downloads the repository ZIP and extracts only the selected files

Then it calls the same model scanner path as upload scans.

## Backend Scan Execution

All scan entry points eventually call:

```py
scanner_service.run_vulnerability_scanner(files_dict)
```

Where `files_dict` is:

```py
{
  "filename.c": "source code text",
  "another.cpp": "source code text"
}
```

For each file:

1. Empty files are skipped.
2. The scanner calls:

   ```py
   run_analysis(file_path, source_code)
   ```

   from `backend/app/services/model_scanner/graph_runner.py`.

3. Vulnerabilities returned for that file are tagged with `file_path`.
4. Results are aggregated across files.
5. Overall risk score is calculated from severity:
   - Critical = 10
   - High = 7
   - Medium = 4
   - Low = 1
6. Overall risk level is assigned:
   - score 0 -> `Safe`
   - score < 10 -> `Low Risk`
   - score < 30 -> `Medium Risk`
   - score < 60 -> `High Risk`
   - otherwise -> `Critical Risk`

The response includes:

- `status`
- `total_vulnerabilities`
- `overall_risk_level`
- `overall_risk_score`
- `files_analyzed`
- `total_chunks_scanned`
- `files_summary`
- `vulnerabilities`
- `corrected_code`
- `files`
- `chunk_outputs`
- `scan_id`

## Current Model Scanner Flow

The scanner implementation is in `backend/app/services/model_scanner/graph_runner.py`.

### Model Configuration

The model endpoint is configured from settings:

- `security_model_base_url`
- `security_model_name`
- `security_model_timeout_seconds`

The model call goes to:

```text
{base_url}/chat/completions
```

Payload shape is OpenAI-compatible:

```json
{
  "model": "configured model name",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.3,
  "top_p": 1.0,
  "repeat_penalty": 1.05,
  "max_tokens": 2048,
  "stream": false
}
```

If no model base URL is configured, the model call returns the error:

```text
Security model endpoint is not configured.
```

That error eventually becomes an HTTP 502 from the scan route.

### Actual `run_analysis()` Flow

This is the active path used by the backend scan service.

1. The uploaded source code is written to a temporary file.

2. The original code is read back from that temporary file.

3. Syntax is checked before static analysis or model work.

   If syntax fails, the backend returns:

   ```text
   We cannot run the security analysis because you have a syntax error in your code.
   ```

   This is treated as a validation failure. The scan is not saved as completed or failed.

4. Static analysis runs:

   ```py
   analyze_file(file_path)
   ```

   from `static_analyzer.py`.

5. Language is detected:

   - C extensions -> `C`
   - C++ extensions -> `CPP`

6. Chunks are prepared.

   Files with 70 lines or fewer skip semantic chunking and are scanned as one chunk.

   Files with more than 70 lines use semantic chunking:

   ```py
   generate_semantic_chunks(Path(file_path))
   ```

   from `semantic_chunker.py`.

7. Chunk metadata is cached locally under the operating system temp directory in `secureguard_chunks`.

8. For each semantic chunk, the scanner calls:

   ```py
   analyze_chunk_with_model(state, chunk, total_chunks)
   ```

9. Each chunk prompt includes:

   - the chunk content
   - line range
   - static analyzer findings for that chunk's line range
   - JSON-only response instructions

10. The model is expected to return JSON:

   ```json
   {
     "vulnerabilities": []
   }
   ```

11. Model output is parsed with `extract_json_object()`.

12. Vulnerabilities are normalized by `normalize_chunk_vulnerabilities()`.

13. Duplicate vulnerabilities are removed using:

   ```py
   (cwe_id, line_number, affected_code)
   ```

14. Per-chunk outputs are stored in `chunk_outputs`.

15. After each chunk scan, the scanner calls:

   ```py
   generate_corrected_code_for_file(state, chunk_vulnerabilities, chunk_code)
   ```

16. The model is asked to generate corrected source code for that chunk.

17. The corrected code is written to another temporary file.

18. Static analysis runs again on the corrected code.

19. `corrected_code_is_clean` is set to `true` only if the corrected code analyzer output is exactly:

   ```text
   findings: Code is safe
   ```

20. Temporary files are deleted.

21. `run_analysis()` returns:

   - language
   - whether vulnerabilities were found
   - vulnerability list
   - corrected code
   - original static findings
   - whether corrected code is clean
   - chunk outputs, including display code and corrected chunk code
   - chunks created

## Static Analyzer Behavior

The static analyzer is in `backend/app/services/model_scanner/static_analyzer.py`.

It runs two external tools:

- `flawfinder`
- `cppcheck`

`flawfinder` runs with:

```text
flawfinder --columns --context --dataonly --html {file_path}
```

`cppcheck` runs with:

```text
cppcheck --enable=all --xml --xml-version=2 {file_path}
```

The analyzer parses both outputs and converts them into a text block like:

```text
finding_1
  file_language: C file
  vul_line_location: line: 10 and column: 5 - High Risk
  vul_detected_line: strcpy(buffer, input)
  possible_cwes: CWE-120
  reason: ...
```

If no findings are found, it returns:

```text
findings: Code is safe
```

Important: this means the model is not scanning blindly. It receives static analyzer findings as evidence and context.

## Semantic Chunker Behavior

The semantic chunker is in `backend/app/services/model_scanner/semantic_chunker.py`.

It prepares model-ready chunks for C/C++ files.

Main behavior:

- detects C or C++ from file extension
- optionally syntax-checks with `gcc` or `g++`
- uses tree-sitter grammars for C and C++ when chunking files over 70 lines
- skips semantic chunking for files with 70 lines or fewer
- guarantees model chunk content stays at or below 70 lines
- splits long functions into syntax-aware windows with one-line overlap
- splits large classes into method-level chunks instead of duplicating the whole class body
- injects compact parent context such as `class Name { ... };` or `namespace Name { ... }`
- adds relevant surrounding context such as includes, macros, typedefs, using statements, globals, and forward declarations
- validates every final model chunk for brace balance before it is returned

If a compiler is missing, syntax check is skipped as successful with a message saying the compiler was not found.

If syntax checking fails, `run_analysis()` raises an error and the scan fails.

## LangGraph Status

`backend/app/services/model_scanner/graph_runner.py` imports LangGraph and defines:

```py
build_graph()
```

The graph contains these nodes:

1. `static_analyzer`
2. `prepare_detect_prompt`
3. `model_detect_cwes`
4. `validate_cwes`
5. `model_generate_corrected_code`
6. `analyze_corrected_code`
7. `retry_corrected_code`
8. `finalize`

The graph edges are:

```text
static_analyzer
-> prepare_detect_prompt
-> model_detect_cwes
-> validate_cwes
-> model_generate_corrected_code
-> analyze_corrected_code
-> retry_corrected_code OR finalize
-> END
```

However, the current production scan path does not call:

```py
build_graph().invoke(...)
```

inside `run_analysis()`.

Instead, `run_analysis()` performs its own direct flow:

```text
temporary file
-> static analyzer
-> semantic chunker
-> model call per chunk
-> dedupe vulnerabilities
-> model call for corrected full code
-> static analyzer on corrected code
-> return result
```

So LangGraph is present in the backend file, but the active scan response currently comes from the custom direct chunk-based pipeline, not from the compiled LangGraph graph.

The standalone `new/main.py` file has a more complete LangGraph-style staged workflow, including missing-CWE retry logic. But it is not imported by the FastAPI backend scan service.

## What Happens When Scan Finishes Successfully

After `run_vulnerability_scanner()` returns, each scan route saves the result.

The backend calls:

```py
create_scan_record(...)
save_vulnerabilities(...)
save_report_artifact(...)
```

from `backend/app/services/scans/scan_storage_service.py`.

### Scan Row

`create_scan_record()` inserts into the `scans` table with:

- `project_id`
- `user_id`
- `status = completed`
- `project_name`
- `scan_type`
- `file_name`
- `branch`
- `risk_level`
- `risk_score`
- `total_vulns`
- `files_scanned`
- `duration_secs`
- `corrected_code`
- `chunk_outputs`
- `started_at`
- `completed_at`

The scan id is added back to the API response as:

```json
{
  "scan_id": "..."
}
```

### Vulnerability Rows

`save_vulnerabilities()` inserts every vulnerability into the `vulnerabilities` table with:

- `scan_id`
- `severity`
- `type`
- `cwe_id`
- `cwe_name`
- `line_number`
- `absolute_line`
- `description`
- `fix_suggestion`
- `function_name`
- `file_path`
- `code_snippet`
- `location`

Severity is stored lowercased.

### Report Artifact

`save_report_artifact()` creates a zipped PDF report through `create_zipped_pdf_report()`.

Then it updates the `scans` row with:

- `report_storage_path`
- `report_expires_at`

It also inserts a row into the `reports` table with:

- `scan_id`
- `user_id`
- report name
- format `pdf`
- status `completed`
- file path
- expiry timestamp

## What the Frontend Does After Successful Scan Response

After the scan API returns:

1. The line animation and elapsed timer are stopped.
2. The code viewer marks lines as vulnerable if a returned vulnerability has `absolute_line` matching that line.
3. Stats are updated:
   - total lines scanned
   - vulnerabilities found
   - elapsed time
4. `scanResult` is stored in React state.
5. `scanComplete` becomes true.
6. The UI displays the completed result, vulnerabilities, corrected code/report-related data depending on the page components.
7. The returned `scan_id` links the result to persisted scan history and report download endpoints.

## What Happens When Scan Fails

If model scanning fails inside a scan route:

- the backend catches the exception
- calculates duration
- calls `create_failed_scan_record()` if there is a project id
- stores a failed scan row with:
  - `status = failed`
  - `risk_level = Failed`
  - `error_message`
  - `completed_at`
- then re-raises the exception

The scanner service wraps per-file model failures as:

```text
HTTP 502: Model scan failed for {file_path}: {error}
```

The frontend catches the failed request and shows the scan error in the New Scan UI.

## Current Important Findings

1. LangGraph is installed/imported and `build_graph()` exists in the backend scanner file, but the active scan path does not invoke the compiled graph.

2. The active backend model pipeline is semantic-chunk based:

   ```text
   static analysis -> semantic chunks -> model per chunk -> corrected code model call -> static recheck
   ```

3. Static analysis evidence from `flawfinder` and `cppcheck` is a major part of the model prompt.

4. The model endpoint must be configured. Without `security_model_base_url`, scans fail.

5. Project file saving and scanning are separate. Files may be saved to Supabase Storage before scanning, but the scan request itself sends source files/content to the scan endpoints.

6. When both existing project files and newly uploaded files are present, the current upload scan branch sends only `uploadedFiles` to `/scan/upload-files`. Existing selected files are loaded for preview but are not included in that multipart scan request.

7. Scan history is persisted only after the model result is returned. There is no initial `pending` or `in_progress` scan row created before model execution in the current scan routes.

8. Report artifacts are generated after successful scan persistence and attached to the scan row.
