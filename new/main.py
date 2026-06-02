import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from langgraph.graph import END, StateGraph

# Add nodes folder to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from nodes.static_analyzer_node import AnalyzerState, static_analyzer_node
from static_analyzer import analyze_file

# ========== HARDCODE YOUR FILE HERE ==========
FILE_TO_ANALYZE = "vul_c.c"
# ============================================

LM_STUDIO_BASE_URL = "https://sesame-oak-unveiled.ngrok-free.dev"
CHAT_COMPLETIONS_URL = f"{LM_STUDIO_BASE_URL}/v1/chat/completions"
MODEL_NAME = "quen_fine_tuned"
MAX_NEW_TOKENS = 2048
COVERAGE_THRESHOLD = 80.0
MODEL_PASS_TIMEOUT_SECONDS = 250
STREAM_READ_TIMEOUT_SECONDS = 250
STREAM_CHUNK_SIZE = 64
CORRECTED_CANDIDATE_FILE = Path(__file__).with_name("corrected_candidate.c")


def format_duration(seconds: float) -> str:
    total_seconds = int(round(seconds))
    minutes, remaining_seconds = divmod(total_seconds, 60)
    return f"{minutes}m {remaining_seconds}s"


def extract_json_object(text: str) -> dict:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start:end + 1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {}


def first_sentence(text: str) -> str:
    text = " ".join(str(text or "").split())
    if not text:
        return "Static analysis reported this CWE."

    stops = [idx for idx in (text.find("."), text.find(";")) if idx != -1]
    if not stops:
        return text
    return text[: min(stops) + 1]


def split_findings(findings: str) -> list[str]:
    blocks = re.split(r"\n\s*\n", findings.strip())
    return [block.strip() for block in blocks if block.strip().startswith("finding_")]


def cwes_from_text(text: str) -> set[str]:
    return set(re.findall(r"CWE-\d+", text))


def expected_cwes_from_findings(findings: str) -> set[str]:
    expected = set()
    for block in split_findings(findings):
        expected.update(cwes_from_text(block))
    return expected


def cwe_evidence_map(findings: str) -> dict[str, str]:
    evidence: dict[str, str] = {}
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

        parts = [part for part in (location, detected_line, reason) if part]
        explanation = first_sentence(" - ".join(parts))
        for cwe in cwes_from_text(block):
            evidence.setdefault(cwe, explanation)
    return evidence


def normalize_vulnerabilities(raw: list, state: AnalyzerState) -> list[dict]:
    expected_cwes = expected_cwes_from_findings(state["static_findings"])
    evidence = cwe_evidence_map(state["static_findings"])
    normalized = []
    seen = set()

    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue

        cwe_id = str(item.get("cwe_id", "")).strip()
        if cwe_id not in expected_cwes or cwe_id in seen:
            continue

        seen.add(cwe_id)
        normalized.append({
            "cwe_id": cwe_id,
            "cwe_name": str(item.get("cwe_name", "")).strip() or cwe_id,
            "explanation": first_sentence(item.get("explanation") or evidence.get(cwe_id)),
        })

    return normalized


def fallback_vulnerability(cwe_id: str, state: AnalyzerState) -> dict:
    evidence = cwe_evidence_map(state["static_findings"])
    return {
        "cwe_id": cwe_id,
        "cwe_name": cwe_id,
        "explanation": first_sentence(evidence.get(cwe_id, "Static analysis reported this CWE.")),
    }


def merge_vulnerabilities(existing: list[dict], new_items: list[dict]) -> list[dict]:
    merged = []
    seen = set()
    for item in existing + new_items:
        cwe_id = item.get("cwe_id", "")
        if not cwe_id or cwe_id in seen:
            continue
        seen.add(cwe_id)
        merged.append({
            "cwe_id": cwe_id,
            "cwe_name": item.get("cwe_name", cwe_id),
            "explanation": first_sentence(item.get("explanation", "")),
        })
    return merged


def coverage_from_vulnerabilities(findings: str, vulnerabilities: list[dict]) -> dict:
    expected = expected_cwes_from_findings(findings)
    present = {item.get("cwe_id", "") for item in vulnerabilities}
    correct = expected.intersection(present)
    missing = expected.difference(present)
    score = 100.0 if not expected else (len(correct) / len(expected)) * 100
    missing_blocks = [
        block for block in split_findings(findings)
        if cwes_from_text(block).intersection(missing)
    ]
    return {
        "confidence_score": score,
        "correct_cwes": sorted(correct),
        "missing_cwes": sorted(missing),
        "missing_findings": "\n\n".join(missing_blocks),
    }


def corrected_code_findings(corrected_code: str, language: str) -> str:
    if not corrected_code or corrected_code == "None":
        return "findings: corrected_code missing"

    suffix = ".cpp" if language == "CPP" else ".c"
    candidate_path = CORRECTED_CANDIDATE_FILE.with_suffix(suffix)
    candidate_path.write_text(corrected_code, encoding="utf-8")
    return analyze_file(str(candidate_path))


def call_model(system_prompt: str, user_prompt: str, label: str) -> tuple[str, str]:
    print(f"\n[{label}] Calling LLM with streaming...")
    print("  Model is thinking... streaming will start as soon as tokens arrive.")
    print(f"  Pass timeout: {MODEL_PASS_TIMEOUT_SECONDS}s")

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "top_p": 1.0,
        "repeat_penalty": 1.05,
        "max_tokens": MAX_NEW_TOKENS,
        "stream": True,
    }

    try:
        started_at = time.monotonic()
        response = requests.post(
            CHAT_COMPLETIONS_URL,
            json=payload,
            stream=True,
            timeout=(10, STREAM_READ_TIMEOUT_SECONDS),
        )

        if response.status_code != 200:
            return "", f"API Error: {response.status_code} - {response.text}"

        print("  Streaming response:")
        print("-" * 50)
        full_response = ""

        for line in response.iter_lines(chunk_size=STREAM_CHUNK_SIZE, decode_unicode=True):
            if time.monotonic() - started_at > MODEL_PASS_TIMEOUT_SECONDS:
                raise TimeoutError(f"model pass exceeded {MODEL_PASS_TIMEOUT_SECONDS} seconds")
            if not line or not line.startswith("data: "):
                continue

            data = line[6:]
            if data == "[DONE]":
                break

            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue

            choices = chunk.get("choices", [])
            if not choices:
                continue

            content = choices[0].get("delta", {}).get("content", "")
            if content:
                full_response += content
                print(content, end="", flush=True)

        elapsed_seconds = time.monotonic() - started_at
        print("\n" + "-" * 50)
        print(f"\n  Total response length: {len(full_response)} chars")
        print(f"  Model pass completed in {format_duration(elapsed_seconds)}")
        return full_response, ""
    except Exception as exc:
        return "", f"Request failed: {exc}"


def prepare_detect_prompt_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 2] Preparing CWE detection prompt...")
    system_prompt = f"""# Role
You identify C/C++ vulnerability CWEs from static-analysis evidence.

# Rules
- Use only CWE IDs supported by the static-analysis findings.
- If a finding lists multiple possible CWEs and they apply, include each one.
- Each explanation must be exactly one short sentence.
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
      "explanation": "One sentence only."
    }}
  ]
}}
"""
    return {**state, "system_prompt": system_prompt, "model_task": "detect_cwes"}


def model_detect_cwes_only_node(state: AnalyzerState) -> AnalyzerState:
    response, error = call_model(
        state["system_prompt"],
        f"Analyze this {state['language']} code and return CWE JSON only:\n\n```{state['language'].lower()}\n{state['original_code']}\n```",
        "Node 3 - model_detect_cwes_only",
    )
    if error:
        print(f"  {error}")
        print("  CWE detection failed; continuing with static-analyzer CWE memory.")
        return {**state, "cwe_model_error": error, "cwe_model_response": ""}
    return {**state, "cwe_model_response": response}


def validate_cwes_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 4] Validating CWE coverage...")
    response_json = extract_json_object(state.get("cwe_model_response", ""))
    vulnerabilities = normalize_vulnerabilities(response_json.get("vulnerabilities", []), state)
    coverage = coverage_from_vulnerabilities(state["static_findings"], vulnerabilities)

    print("\n" + "=" * 60)
    print("CWE COVERAGE CHECK")
    print("=" * 60)
    print(f"Coverage score: {coverage['confidence_score']:.1f}%")
    print(f"Required coverage: {COVERAGE_THRESHOLD:.1f}%")
    print(f"Covered CWEs: {', '.join(coverage['correct_cwes']) if coverage['correct_cwes'] else 'None'}")
    print(f"Missing CWEs: {', '.join(coverage['missing_cwes']) if coverage['missing_cwes'] else 'None'}")

    return {
        **state,
        "vulnerabilities": vulnerabilities,
        "confidence_score": coverage["confidence_score"],
        "correct_cwes": coverage["correct_cwes"],
        "missing_cwes": coverage["missing_cwes"],
        "missing_findings": coverage["missing_findings"],
    }


def should_retry_missing_cwes(state: AnalyzerState) -> str:
    if state.get("error"):
        return "skip"
    if state.get("missing_cwes"):
        print("Retry decision: running missing-CWE retry.")
        return "retry"
    print("Retry decision: CWE list is complete.")
    return "skip"


def retry_missing_cwes_only_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 5] Retrying missing CWEs only...")
    missing_cwes = ", ".join(state.get("missing_cwes", []))
    system_prompt = f"""# Role
You add only missing CWE objects from static-analysis evidence.

# Rules
- Return vulnerability objects only for these missing CWEs: {missing_cwes}
- Do not return already covered CWEs.
- Each explanation must be exactly one short sentence.
- Return JSON only. No markdown.

# Missing Static Analysis Findings
{state.get("missing_findings", "")}

# Required JSON Schema
{{
  "vulnerabilities": [
    {{
      "cwe_id": "CWE-XXX",
      "cwe_name": "name of cwe",
      "explanation": "One sentence only."
    }}
  ]
}}
"""
    response, error = call_model(
        system_prompt,
        f"Return missing CWE objects for this {state['language']} code only.",
        "Node 5 - retry_missing_cwes_only",
    )
    if error:
        print(f"  {error}")
        return {**state, "missing_retry_error": error}

    response_json = extract_json_object(response)
    retry_vulnerabilities = normalize_vulnerabilities(response_json.get("vulnerabilities", []), state)
    merged = merge_vulnerabilities(state.get("vulnerabilities", []), retry_vulnerabilities)
    return {**state, "vulnerabilities": merged, "missing_cwe_model_response": response}


def merge_cwes_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 6] Merging CWE memory...")
    expected = expected_cwes_from_findings(state["static_findings"])
    vulnerabilities = merge_vulnerabilities(state.get("vulnerabilities", []), [])
    present = {item["cwe_id"] for item in vulnerabilities}

    for cwe_id in sorted(expected.difference(present)):
        vulnerabilities.append(fallback_vulnerability(cwe_id, state))

    coverage = coverage_from_vulnerabilities(state["static_findings"], vulnerabilities)
    print(f"  CWE memory count: {len(vulnerabilities)}")
    print(f"  CWE confidence after merge: {coverage['confidence_score']:.1f}%")
    print(f"  All CWEs: {', '.join(item['cwe_id'] for item in vulnerabilities) if vulnerabilities else 'None'}")

    return {
        **state,
        "vulnerabilities": vulnerabilities,
        "final_confidence_score": coverage["confidence_score"],
        "missing_cwes": coverage["missing_cwes"],
    }


def prepare_code_prompt(state: AnalyzerState, retry: bool = False) -> str:
    cwe_list = json.dumps(state.get("vulnerabilities", []), indent=2)
    retry_findings = state.get("corrected_code_findings", "")
    retry_section = f"\n# Analyzer Findings From Previous corrected_code\n{retry_findings}\n" if retry else ""
    return f"""# Role
You generate secure corrected C/C++ code.

# Rules
- Return only corrected_code JSON. Do not return CWE objects.
- The code must fix every CWE listed below.
- The code must address the static-analysis evidence.
- Avoid introducing new static-analyzer findings.
- Return JSON only. No markdown.

# CWE Memory
{cwe_list}

# Static Analysis Findings
{state["static_findings"]}
{retry_section}
# Required JSON Schema
{{
  "corrected_code": "Full secure corrected code"
}}
"""


def model_generate_corrected_code_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 7] Generating corrected code...")
    response, error = call_model(
        prepare_code_prompt(state),
        f"Generate corrected {state['language']} code for the original code:\n\n```{state['language'].lower()}\n{state['original_code']}\n```",
        "Node 7 - model_generate_corrected_code",
    )
    if error:
        print(f"  {error}")
        print("  Corrected-code generation failed; retry node will attempt code-only generation.")
        return {**state, "code_model_error": error, "corrected_code": ""}

    corrected_code = extract_json_object(response).get("corrected_code", "")
    return {**state, "corrected_code": corrected_code, "code_model_response": response}


def analyze_corrected_code_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 8] Analyzing corrected_code...")
    findings = corrected_code_findings(state.get("corrected_code", ""), state["language"])
    is_clean = findings.strip() == "findings: Code is safe"
    print(f"  Corrected-code analyzer clean: {'yes' if is_clean else 'no'}")
    if not is_clean:
        print("  Corrected-code findings:")
        print(findings)
    return {
        **state,
        "corrected_code_findings": findings,
        "corrected_code_is_clean": is_clean,
    }


def should_retry_corrected_code(state: AnalyzerState) -> str:
    if state.get("error"):
        return "skip"
    if state.get("code_retry_count", 0) > 0:
        print("Corrected-code retry decision: skipped because retry already ran.")
        return "skip"
    if not state.get("corrected_code_is_clean", True):
        print("Corrected-code retry decision: running retry.")
        return "retry"
    print("Corrected-code retry decision: no retry needed.")
    return "skip"


def retry_corrected_code_only_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 9] Retrying corrected code only...")
    response, error = call_model(
        prepare_code_prompt(state, retry=True),
        f"Return corrected {state['language']} code only, fixing the analyzer findings from the previous corrected_code.",
        "Node 9 - retry_corrected_code_only",
    )
    if error:
        print(f"  {error}")
        return {**state, "code_retry_error": error, "code_retry_count": state.get("code_retry_count", 0) + 1}

    corrected_code = extract_json_object(response).get("corrected_code", "")
    return {
        **state,
        "corrected_code": corrected_code,
        "code_retry_response": response,
        "code_retry_count": state.get("code_retry_count", 0) + 1,
    }


def finalize_json_node(state: AnalyzerState) -> AnalyzerState:
    print("\n[Node 10] Finalizing JSON response...")
    if state.get("error"):
        return state

    final_json = {
        "language": state.get("language", ""),
        "is_vulnerable": bool(state.get("vulnerabilities")),
        "vulnerabilities": state.get("vulnerabilities", []),
        "corrected_code": state.get("corrected_code", "") or "None",
    }
    final_response = json.dumps(final_json, indent=2, ensure_ascii=False)
    print("  Final JSON assembled from in-memory CWE list and corrected_code.")
    return {**state, "model_response": final_response}


def build_graph():
    graph = StateGraph(AnalyzerState)
    graph.add_node("static_analyzer", static_analyzer_node)
    graph.add_node("prepare_detect_prompt", prepare_detect_prompt_node)
    graph.add_node("model_detect_cwes_only", model_detect_cwes_only_node)
    graph.add_node("validate_cwes", validate_cwes_node)
    graph.add_node("retry_missing_cwes_only", retry_missing_cwes_only_node)
    graph.add_node("merge_cwes", merge_cwes_node)
    graph.add_node("model_generate_corrected_code", model_generate_corrected_code_node)
    graph.add_node("analyze_corrected_code", analyze_corrected_code_node)
    graph.add_node("retry_corrected_code_only", retry_corrected_code_only_node)
    graph.add_node("finalize_json", finalize_json_node)

    graph.set_entry_point("static_analyzer")
    graph.add_edge("static_analyzer", "prepare_detect_prompt")
    graph.add_edge("prepare_detect_prompt", "model_detect_cwes_only")
    graph.add_edge("model_detect_cwes_only", "validate_cwes")
    graph.add_conditional_edges(
        "validate_cwes",
        should_retry_missing_cwes,
        {"retry": "retry_missing_cwes_only", "skip": "merge_cwes"},
    )
    graph.add_edge("retry_missing_cwes_only", "merge_cwes")
    graph.add_edge("merge_cwes", "model_generate_corrected_code")
    graph.add_edge("model_generate_corrected_code", "analyze_corrected_code")
    graph.add_conditional_edges(
        "analyze_corrected_code",
        should_retry_corrected_code,
        {"retry": "retry_corrected_code_only", "skip": "finalize_json"},
    )
    graph.add_edge("retry_corrected_code_only", "analyze_corrected_code")
    graph.add_edge("finalize_json", END)

    return graph.compile()


def run_analysis(file_path: str):
    initial_state: AnalyzerState = {
        "file_path": file_path,
        "original_code": "",
        "language": "",
        "static_findings": "",
        "system_prompt": "",
        "model_response": "",
        "cwe_model_response": "",
        "cwe_model_error": "",
        "missing_cwe_model_response": "",
        "code_model_response": "",
        "code_model_error": "",
        "code_retry_response": "",
        "vulnerabilities": [],
        "corrected_code": "",
        "confidence_score": 0.0,
        "final_confidence_score": 0.0,
        "correct_cwes": [],
        "missing_cwes": [],
        "missing_findings": "",
        "corrected_code_findings": "",
        "corrected_code_is_clean": True,
        "code_retry_count": 0,
        "error": "",
    }

    print("\n" + "=" * 60)
    print("RUNNING LANGGRAPH PIPELINE")
    print(f"Retry threshold: {COVERAGE_THRESHOLD:.1f}% CWE coverage")
    print(f"Max model time: {MODEL_PASS_TIMEOUT_SECONDS * 4}s across staged passes")
    print("=" * 60)

    return build_graph().invoke(initial_state)


if __name__ == "__main__":
    process_started_at = time.monotonic()

    if not Path(FILE_TO_ANALYZE).exists():
        print(f"Error: File '{FILE_TO_ANALYZE}' not found!")
        print(f"Current directory: {Path.cwd()}")
        print("Available files:")
        for f in Path.cwd().glob("*"):
            if f.suffix in [".c", ".cpp", ".cc", ".cxx"]:
                print(f"  - {f.name}")
        raise SystemExit(1)

    print(f"\nAnalyzing file: {FILE_TO_ANALYZE}")
    print(f"Language: {'C++' if FILE_TO_ANALYZE.endswith(('.cpp', '.cc', '.cxx', '.c++')) else 'C'}")

    result = run_analysis(FILE_TO_ANALYZE)

    if result.get("error"):
        print(f"\nError: {result['error']}")
    else:
        print("\n" + "=" * 60)
        print("CWE COVERAGE SUMMARY")
        print("=" * 60)
        print(f"First-pass coverage score: {result.get('confidence_score', 0.0):.1f}%")
        print(f"Final confidence score: {result.get('final_confidence_score', 0.0):.1f}%")
        print(f"Corrected-code analyzer clean: {'yes' if result.get('corrected_code_is_clean', True) else 'no'}")

        print("\n" + "=" * 60)
        print("FINAL RESPONSE")
        print("=" * 60)
        print(result["model_response"])

        with open("analysis_result.json", "w", encoding="utf-8") as f:
            f.write(result["model_response"])
        print("\nResponse saved to analysis_result.json")

    total_elapsed_seconds = time.monotonic() - process_started_at
    print("\n" + "=" * 60)
    print(f"TOTAL PROCESS TIME: {format_duration(total_elapsed_seconds)}")
    print("=" * 60)
