#### Yes — all direct model calls live in graph_runner.py

- Definition: call_model() — graph_runner.py:402
- HTTP requests to model endpoints: primary and fallback requests.post — graph_runner.py:422 and graph_runner.py:443
```
- Places that invoke the model via call_model()
- analyze_chunk_with_model() — graph_runner.py:489
- generate_corrected_code_for_file() — graph_runner.py:504
- model_detect_cwes_node() — graph_runner.py:562
- model_generate_corrected_code_node() — graph_runner.py:615
- retry_corrected_code_node() — graph_runner.py:652
```

- Other backend modules (e.g., scanner_service.py) call into this scanner/graph runner (e.g., run_analysis() / iter_analysis_events()), but no other file performs direct model HTTP calls.
.env
```
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL_NAME=openai/gpt-oss-120b
```
- config.py
```
Added groq_model_name
Set the Groq base URL default to the OpenAI-compatible Groq endpoint
```
- graph_runner.py
- Groq fallback now uses openai/gpt-oss-120b
- Added concise proof logs for:
```
primary endpoint timeout
primary endpoint non-200 response
primary endpoint empty response
Groq timeout
Groq non-200 response
Groq empty response
Groq success
exceptions on both paths
```
---

Those top summary values are stored primarily in public.scans, not in public.reports.

The exact mapping is:

- Risk -> public.scans.risk_level
- Vulnerabilities -> public.scans.total_vulns
- Files -> public.scans.files_scanned
- Score -> public.scans.risk_score
- You can see those columns being written in scan_storage_service.py:7-29 and then used again when building the report data in report_storage_service.py:244-246. The PDF itself is saved in the scan-reports storage bucket, while reports only points to it. The report page pulls report rows joined with the related scans row, which is why those summary values still appear there.