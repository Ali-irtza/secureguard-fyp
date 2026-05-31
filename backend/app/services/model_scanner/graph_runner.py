import json
import re
import tempfile
import time
from pathlib import Path
from typing import TypedDict

import requests
from langgraph.graph import END, StateGraph

from app.config import settings
from app.services.model_scanner.static_analyzer import analyze_file, detect_language
from app.services.model_scanner.semantic_chunker import generate_semantic_chunks


class AnalyzerState(TypedDict, total=False):
    file_path: str
    file_name: str
    original_code: str
    language: str
    static_findings: str
    system_prompt: str
    cwe_model_response: str
    code_model_response: str
    vulnerabilities: list[dict]
    corrected_code: str
    confidence_score: float
    missing_cwes: list[str]
    missing_findings: str
    corrected_code_findings: str
    corrected_code_is_clean: bool
    code_retry_count: int
    model_response: str
    error: str


MODEL_NAME = getattr(settings, "security_model_name", "quen_fine_tuned")
MODEL_PASS_TIMEOUT_SECONDS = int(getattr(settings, "security_model_timeout_seconds", 250))


def _chat_url() -> str:
    base_url = getattr(settings, "security_model_base_url", "") or getattr(settings, "freellmapi_url", "")
    if not base_url:
        return ""
    return f"{base_url.rstrip('/')}/chat/completions"


def extract_json_object(text: str) -> dict:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {}


def first_sentence(text: str) -> str:
    text = " ".join(str(text or "").split())
    if not text:
        return "Static analysis reported this issue."
    stops = [idx for idx in (text.find("."), text.find(";")) if idx != -1]
    return text if not stops else text[: min(stops) + 1]


def split_findings(findings: str) -> list[str]:
    blocks = re.split(r"\n\s*\n", findings.strip())
    return [block.strip() for block in blocks if block.strip().startswith("finding_")]


def cwes_from_text(text: str) -> set[str]:
    return set(re.findall(r"CWE-\d+", text))


def expected_cwes_from_findings(findings: str) -> set[str]:
    expected: set[str] = set()
    for block in split_findings(findings):
        expected.update(cwes_from_text(block))
    return expected


def _line_number_from_finding(block: str) -> int:
    match = re.search(r"vul_line_location:\s*line:\s*(\d+)", block)
    return int(match.group(1)) if match else 0


def cwe_evidence_map(findings: str) -> dict[str, dict]:
    evidence: dict[str, dict] = {}
    for block in split_findings(findings):
        reason = ""
        location = ""
        detected_line = ""
        for line in block.splitlines():
            stripped = line.strip()
            if stripped.startswith("reason:"):
                reason = stripped.removeprefix("reason:").strip()
            elif stripped.startswith("vul_line_location:"):
                location = stripped.removeprefix("vul_line_location:").strip()
            elif stripped.startswith("vul_detected_line:"):
                detected_line = stripped.removeprefix("vul_detected_line:").strip()
        for cwe in cwes_from_text(block):
            evidence.setdefault(
                cwe,
                {
                    "location": location,
                    "line_number": _line_number_from_finding(block),
                    "affected_code": detected_line,
                    "description": first_sentence(reason),
                },
            )
    return evidence


def severity_from_location(location: str) -> str:
    lowered = location.lower()
    if "critical" in lowered:
        return "Critical"
    if "high" in lowered:
        return "High"
    if "moderate" in lowered or "medium" in lowered:
        return "Medium"
    return "Low"


def normalize_vulnerabilities(raw: list, state: AnalyzerState) -> list[dict]:
    expected = expected_cwes_from_findings(state["static_findings"])
    evidence = cwe_evidence_map(state["static_findings"])
    normalized = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        cwe_id = str(item.get("cwe_id", "")).strip()
        if cwe_id not in expected or cwe_id in seen:
            continue
        seen.add(cwe_id)
        ev = evidence.get(cwe_id, {})
        normalized.append(
            {
                "cwe_id": cwe_id,
                "cwe_name": str(item.get("cwe_name", "")).strip() or cwe_id,
                "severity": str(item.get("severity", "")).strip() or severity_from_location(ev.get("location", "")),
                "line_number": int(item.get("line_number") or ev.get("line_number") or 0),
                "absolute_line": int(item.get("line_number") or ev.get("line_number") or 0),
                "location": str(item.get("location", "")).strip() or ev.get("location", ""),
                "description": first_sentence(item.get("description") or item.get("explanation") or ev.get("description")),
                "fix_suggestion": first_sentence(item.get("fix_suggestion") or item.get("recommended_fix") or "Apply bounds checks, validate input, and replace unsafe calls with safer alternatives."),
                "affected_code": str(item.get("affected_code", "")).strip() or ev.get("affected_code", ""),
                "function_name": str(item.get("function_name", "")).strip(),
                "file_path": state.get("file_name", ""),
            }
        )
    return normalized


def normalize_chunk_vulnerabilities(raw: list, state: AnalyzerState, chunk: dict) -> list[dict]:
    evidence = cwe_evidence_map(state["static_findings"])
    normalized = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        cwe_id = str(item.get("cwe_id", "")).strip()
        if not cwe_id:
            continue
        line_number = int(item.get("line_number") or item.get("absolute_line") or chunk.get("start_line") or 0)
        ev = evidence.get(cwe_id, {})
        normalized.append(
            {
                "cwe_id": cwe_id,
                "cwe_name": str(item.get("cwe_name", "")).strip() or cwe_id,
                "severity": str(item.get("severity", "")).strip() or severity_from_location(ev.get("location", "")),
                "line_number": line_number,
                "absolute_line": line_number,
                "location": str(item.get("location", "")).strip() or ev.get("location", "") or f"lines {chunk.get('start_line')}-{chunk.get('end_line')}",
                "description": first_sentence(item.get("description") or item.get("explanation") or ev.get("description")),
                "fix_suggestion": first_sentence(item.get("fix_suggestion") or item.get("recommended_fix") or "Apply bounds checks, validate input, and replace unsafe calls with safer alternatives."),
                "affected_code": str(item.get("affected_code", "")).strip() or ev.get("affected_code", ""),
                "function_name": str(item.get("function_name", "")).strip() or chunk.get("name", ""),
                "file_path": state.get("file_name", ""),
                "chunk_index": chunk.get("index"),
                "chunk_name": chunk.get("name", ""),
                "chunk_start_line": chunk.get("start_line", 0),
                "chunk_end_line": chunk.get("end_line", 0),
            }
        )
    return normalized


def coverage(findings: str, vulnerabilities: list[dict]) -> tuple[float, list[str], str]:
    expected = expected_cwes_from_findings(findings)
    present = {item.get("cwe_id", "") for item in vulnerabilities}
    missing = sorted(expected.difference(present))
    score = 100.0 if not expected else (len(expected.intersection(present)) / len(expected)) * 100
    missing_blocks = [block for block in split_findings(findings) if cwes_from_text(block).intersection(missing)]
    return score, missing, "\n\n".join(missing_blocks)


def call_model(system_prompt: str, user_prompt: str) -> tuple[str, str]:
    if not _chat_url():
        return "", "Security model endpoint is not configured."
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "top_p": 1.0,
        "repeat_penalty": 1.05,
        "max_tokens": 2048,
        "stream": False,
    }
    try:
        started_at = time.monotonic()
        response = requests.post(_chat_url(), json=payload, timeout=(10, MODEL_PASS_TIMEOUT_SECONDS))
        if time.monotonic() - started_at > MODEL_PASS_TIMEOUT_SECONDS:
            return "", "Model pass timed out."
        if response.status_code != 200:
            return "", f"Model API error: {response.status_code} - {response.text}"
        data = response.json()
        return data["choices"][0]["message"]["content"], ""
    except Exception as exc:
        return "", f"Model request failed: {exc}"


def analyze_chunk_with_model(state: AnalyzerState, chunk: dict, total_chunks: int) -> tuple[list[dict], str]:
    system_prompt = f"""# Role
You review one semantic C/C++ source chunk for security vulnerabilities.

# Rules
- Analyze only the provided chunk and its included context.
- Report real vulnerabilities with exact line number, affected code, explanation, severity, and fix.
- Return JSON only. No markdown.

# Static Evidence For Whole File
{state["static_findings"]}

# Required JSON Schema
{{
  "chunk_summary": "short summary of this chunk",
  "vulnerabilities": [
    {{
      "cwe_id": "CWE-XXX",
      "cwe_name": "name",
      "severity": "Critical|High|Medium|Low",
      "line_number": 1,
      "location": "file and line details",
      "affected_code": "exact vulnerable code",
      "description": "what is vulnerable here",
      "fix_suggestion": "how to fix it"
    }}
  ]
}}
"""
    response, error = call_model(
        system_prompt,
        f"Review chunk {chunk['index']} of {total_chunks}: {chunk['kind']} {chunk['name']} lines {chunk['start_line']}-{chunk['end_line']}.\n\n```{state['language'].lower()}\n{chunk['content']}\n```",
    )
    if error:
        raise RuntimeError(error)
    parsed = extract_json_object(response)
    return normalize_chunk_vulnerabilities(parsed.get("vulnerabilities", []), state, chunk), parsed.get("chunk_summary", "")


def generate_corrected_code_for_file(state: AnalyzerState, vulnerabilities: list[dict]) -> tuple[str, str]:
    response, error = call_model(
        prepare_code_prompt({**state, "vulnerabilities": vulnerabilities}),
        f"Generate full corrected {state['language']} source code for the whole file:\n\n```{state['language'].lower()}\n{state['original_code']}\n```",
    )
    if error:
        raise RuntimeError(error)
    corrected_code = extract_json_object(response).get("corrected_code", "")
    if not corrected_code:
        raise RuntimeError("Security model did not return corrected code.")
    return corrected_code, response


def static_analyzer_node(state: AnalyzerState) -> AnalyzerState:
    findings = analyze_file(state["file_path"])
    original_code = Path(state["file_path"]).read_text(encoding="utf-8", errors="replace")
    return {
        **state,
        "static_findings": findings,
        "original_code": original_code,
        "language": detect_language(state["file_path"]),
    }


def prepare_detect_prompt_node(state: AnalyzerState) -> AnalyzerState:
    system_prompt = f"""# Role
You identify C/C++ vulnerability CWEs from static-analysis evidence.

# Rules
- Use only CWE IDs supported by the static-analysis findings.
- Each finding must include severity, line_number, description, fix_suggestion, and affected_code when available.
- Return JSON only. No markdown.

# Static Analysis Findings
{state["static_findings"]}

# Required JSON Schema
{{
  "language": "C or CPP",
  "is_vulnerable": true,
  "vulnerabilities": [
    {{
      "cwe_id": "CWE-XXX",
      "cwe_name": "name of cwe",
      "severity": "Critical|High|Medium|Low",
      "line_number": 1,
      "description": "What is wrong",
      "fix_suggestion": "How to fix it",
      "affected_code": "line of code"
    }}
  ]
}}
"""
    return {**state, "system_prompt": system_prompt}


def model_detect_cwes_node(state: AnalyzerState) -> AnalyzerState:
    response, error = call_model(
        state["system_prompt"],
        f"Analyze this {state['language']} code and return vulnerability JSON only:\n\n```{state['language'].lower()}\n{state['original_code']}\n```",
    )
    if error:
        return {**state, "cwe_model_response": "", "error": error}
    return {**state, "cwe_model_response": response}


def validate_cwes_node(state: AnalyzerState) -> AnalyzerState:
    response_json = extract_json_object(state.get("cwe_model_response", ""))
    vulnerabilities = normalize_vulnerabilities(response_json.get("vulnerabilities", []), state)
    score, missing, missing_findings = coverage(state["static_findings"], vulnerabilities)
    return {
        **state,
        "vulnerabilities": vulnerabilities,
        "confidence_score": score,
        "missing_cwes": missing,
        "missing_findings": missing_findings,
    }


def should_continue_detection(state: AnalyzerState) -> str:
    if state.get("error"):
        return "error"
    return "continue"


def prepare_code_prompt(state: AnalyzerState, retry: bool = False) -> str:
    retry_section = f"\n# Analyzer Findings From Previous corrected_code\n{state.get('corrected_code_findings', '')}\n" if retry else ""
    return f"""# Role
You generate secure corrected C/C++ code.

# Rules
- Return only corrected_code JSON. Do not return CWE objects.
- Fix every vulnerability listed below.
- Avoid introducing new static-analyzer findings.
- Return JSON only. No markdown.

# Vulnerability Memory
{json.dumps(state.get("vulnerabilities", []), indent=2)}

# Static Analysis Findings
{state["static_findings"]}
{retry_section}
# Required JSON Schema
{{ "corrected_code": "Full secure corrected code" }}
"""


def model_generate_corrected_code_node(state: AnalyzerState) -> AnalyzerState:
    response, error = call_model(
        prepare_code_prompt(state),
        f"Generate corrected {state['language']} code for:\n\n```{state['language'].lower()}\n{state['original_code']}\n```",
    )
    if error:
        return {**state, "code_model_response": "", "corrected_code": "None", "error": error}
    corrected_code = extract_json_object(response).get("corrected_code", "")
    if not corrected_code:
        return {
            **state,
            "code_model_response": response,
            "corrected_code": "None",
            "error": "Security model did not return corrected code.",
        }
    return {**state, "code_model_response": response, "corrected_code": corrected_code}


def analyze_corrected_code_node(state: AnalyzerState) -> AnalyzerState:
    corrected_code = state.get("corrected_code", "")
    if not corrected_code or corrected_code == "None":
        return {**state, "corrected_code_findings": "findings: corrected_code missing", "corrected_code_is_clean": False}
    suffix = ".cpp" if state["language"] == "CPP" else ".c"
    with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, encoding="utf-8") as handle:
        handle.write(corrected_code)
        candidate = handle.name
    findings = analyze_file(candidate)
    Path(candidate).unlink(missing_ok=True)
    return {**state, "corrected_code_findings": findings, "corrected_code_is_clean": findings.strip() == "findings: Code is safe"}


def should_retry_code(state: AnalyzerState) -> str:
    if state.get("code_retry_count", 0) > 0:
        return "skip"
    return "retry" if not state.get("corrected_code_is_clean", True) else "skip"


def retry_corrected_code_node(state: AnalyzerState) -> AnalyzerState:
    response, error = call_model(
        prepare_code_prompt(state, retry=True),
        f"Return corrected {state['language']} code only, fixing the analyzer findings from the previous corrected_code.",
    )
    if error:
        return {**state, "code_retry_count": 1, "error": error}
    corrected_code = extract_json_object(response).get("corrected_code", "")
    return {**state, "corrected_code": corrected_code or state.get("corrected_code", "None"), "code_retry_count": 1}


def finalize_node(state: AnalyzerState) -> AnalyzerState:
    if state.get("error"):
        return state
    final_json = {
        "language": "C++" if state.get("language") == "CPP" else "C",
        "is_vulnerable": bool(state.get("vulnerabilities")),
        "vulnerabilities": state.get("vulnerabilities", []),
        "corrected_code": state.get("corrected_code") or "None",
        "static_findings": state.get("static_findings", ""),
        "corrected_code_is_clean": state.get("corrected_code_is_clean", False),
    }
    return {**state, "model_response": json.dumps(final_json, ensure_ascii=False)}


def build_graph():
    graph = StateGraph(AnalyzerState)
    graph.add_node("static_analyzer", static_analyzer_node)
    graph.add_node("prepare_detect_prompt", prepare_detect_prompt_node)
    graph.add_node("model_detect_cwes", model_detect_cwes_node)
    graph.add_node("validate_cwes", validate_cwes_node)
    graph.add_node("model_generate_corrected_code", model_generate_corrected_code_node)
    graph.add_node("analyze_corrected_code", analyze_corrected_code_node)
    graph.add_node("retry_corrected_code", retry_corrected_code_node)
    graph.add_node("finalize", finalize_node)
    graph.set_entry_point("static_analyzer")
    graph.add_edge("static_analyzer", "prepare_detect_prompt")
    graph.add_edge("prepare_detect_prompt", "model_detect_cwes")
    graph.add_conditional_edges("model_detect_cwes", should_continue_detection, {"error": END, "continue": "validate_cwes"})
    graph.add_edge("validate_cwes", "model_generate_corrected_code")
    graph.add_edge("model_generate_corrected_code", "analyze_corrected_code")
    graph.add_conditional_edges("analyze_corrected_code", should_retry_code, {"retry": "retry_corrected_code", "skip": "finalize"})
    graph.add_edge("retry_corrected_code", "analyze_corrected_code")
    graph.add_edge("finalize", END)
    return graph.compile()


def run_analysis(file_name: str, source_code: str) -> dict:
    suffix = Path(file_name).suffix or ".c"
    with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, encoding="utf-8") as handle:
        handle.write(source_code)
        file_path = handle.name
    try:
        original_code = Path(file_path).read_text(encoding="utf-8", errors="replace")
        static_findings = analyze_file(file_path)
        language = detect_language(file_path)
        chunk_result = generate_semantic_chunks(Path(file_path))
        if not chunk_result["syntax_ok"]:
            raise RuntimeError(f"Source syntax check failed: {chunk_result['syntax_output']}")

        chunks = chunk_result["chunks"] or [
            {
                "index": 1,
                "kind": "file",
                "name": file_name,
                "start_line": 1,
                "end_line": max(1, original_code.count("\n") + 1),
                "content": original_code,
            }
        ]
        state: AnalyzerState = {
            "file_path": file_path,
            "file_name": file_name,
            "original_code": original_code,
            "static_findings": static_findings,
            "language": language,
        }

        vulnerabilities: list[dict] = []
        chunk_outputs: list[dict] = []
        seen = set()
        for chunk in chunks:
            chunk_vulns, summary = analyze_chunk_with_model(state, chunk, len(chunks))
            unique_chunk_vulns = []
            for vuln in chunk_vulns:
                key = (vuln.get("cwe_id"), vuln.get("line_number"), vuln.get("affected_code"))
                if key in seen:
                    continue
                seen.add(key)
                vulnerabilities.append(vuln)
                unique_chunk_vulns.append(vuln)
            chunk_outputs.append(
                {
                    "chunk_index": chunk["index"],
                    "chunk_name": chunk["name"],
                    "chunk_kind": chunk["kind"],
                    "start_line": chunk["start_line"],
                    "end_line": chunk["end_line"],
                    "summary": summary,
                    "vulnerabilities": unique_chunk_vulns,
                }
            )

        corrected_code, _ = generate_corrected_code_for_file(state, vulnerabilities)
        suffix = ".cpp" if language == "CPP" else ".c"
        with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, encoding="utf-8") as handle:
            handle.write(corrected_code)
            candidate = handle.name
        corrected_findings = analyze_file(candidate)
        Path(candidate).unlink(missing_ok=True)
        return {
            "language": "C++" if language == "CPP" else "C",
            "is_vulnerable": bool(vulnerabilities),
            "vulnerabilities": vulnerabilities,
            "corrected_code": corrected_code,
            "static_findings": static_findings,
            "corrected_code_is_clean": corrected_findings.strip() == "findings: Code is safe",
            "chunk_outputs": chunk_outputs,
            "chunks_created": len(chunks),
        }
    finally:
        Path(file_path).unlink(missing_ok=True)
