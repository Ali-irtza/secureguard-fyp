"""
ai_scanner.py

Sends C/C++ code chunks to FreeLLMAPI and returns structured vulnerability results.
"""

import json
from typing import Dict, List

import httpx

from app.services.scans.ast_parser import CodeChunk, extract_chunks
from app.services.scans.cwe_definitions import get_cwe_prompt_text
from app.config import settings

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

FREELLMAPI_URL: str = getattr(settings, "freellmapi_url", "http://localhost:3001/v1")
FREELLMAPI_KEY: str = getattr(settings, "freellmapi_key", "")

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT: str = f"""You are a C/C++ security vulnerability scanner. \
Your job is to detect real security vulnerabilities only.

{get_cwe_prompt_text()}

Rules:
- Only report vulnerabilities from the list above. Do not invent new CWE IDs.
- Be precise about line numbers relative to the code shown to you.
- If no vulnerability is found, return an empty array.
- Respond ONLY with valid JSON. No explanation, no markdown, no code fences."""


def build_user_prompt(chunk: CodeChunk) -> str:
    """Build the per-chunk user prompt sent to the LLM."""
    return (
        f"Scan this C/C++ function for vulnerabilities.\n\n"
        f"Function name: {chunk.name}\n"
        f"This function starts at line {chunk.start_line} in the original file.\n\n"
        f"Code:\n{chunk.code}\n\n"
        f"Respond ONLY with this exact JSON format:\n"
        "{\n"
        '  "vulnerabilities": [\n'
        "    {\n"
        '      "cwe_id": "CWE-XXX",\n'
        '      "cwe_name": "Name here",\n'
        '      "severity": "Critical|High|Medium",\n'
        '      "line_number": 5,\n'
        '      "description": "What exactly is wrong in this code",\n'
        '      "fix_suggestion": "How to fix it"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        'If no issues found return: {"vulnerabilities": []}'
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean_json_response(text: str) -> str:
    """
    Strip markdown code fences from an LLM response so it can be parsed as JSON.

    Handles:
        ```json\\n{...}\\n```
        ```\\n{...}\\n```
        plain JSON text
    """
    text = text.strip()

    if text.startswith("```"):
        # Remove opening fence line
        text = text[3:]
        if text.startswith("json"):
            text = text[4:]
        # Remove closing fence
        if text.endswith("```"):
            text = text[:-3]

    return text.strip()


# ---------------------------------------------------------------------------
# Core scanning functions
# ---------------------------------------------------------------------------

async def scan_chunk(chunk: CodeChunk, client: httpx.AsyncClient) -> List[Dict]:
    """
    Send a single CodeChunk to the LLM and return a list of vulnerability dicts.

    Each returned dict is augmented with:
        - function_name  : the chunk's function name
        - absolute_line  : line number mapped back to the original file
    """
    payload = {
        "model": "auto",
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": build_user_prompt(chunk)},
        ],
    }

    headers = {
        "Authorization": f"Bearer {FREELLMAPI_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = await client.post(
            f"{FREELLMAPI_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60.0,
        )
        response.raise_for_status()

        data = response.json()
        raw_content: str = data["choices"][0]["message"]["content"]

        cleaned = clean_json_response(raw_content)
        result = json.loads(cleaned)
        vulnerabilities: List[Dict] = result.get("vulnerabilities", [])

        # Enrich each vulnerability with context from the chunk
        for vuln in vulnerabilities:
            vuln["function_name"] = chunk.name
            vuln["absolute_line"] = (
                chunk.start_line + vuln.get("line_number", 1) - 1
            )

        return vulnerabilities

    except Exception as exc:  # noqa: BLE001
        print(f"[ai_scanner] Error scanning chunk '{chunk.name}': {exc}")
        return []


async def scan_file(source_code: str) -> Dict:
    """
    Parse source_code into chunks, scan each one, and return an aggregated
    vulnerability report.

    Returns
    -------
    {
        "total_vulnerabilities": int,
        "risk_score":            int,
        "risk_level":            str,
        "chunks_scanned":        int,
        "vulnerabilities":       list,
    }
    """
    chunks = extract_chunks(source_code)
    all_vulnerabilities: List[Dict] = []

    async with httpx.AsyncClient() as client:
        for chunk in chunks:
            chunk_vulns = await scan_chunk(chunk, client)
            all_vulnerabilities.extend(chunk_vulns)

    # Calculate risk score
    severity_points = {"Critical": 10, "High": 7, "Medium": 4}
    risk_score: int = sum(
        severity_points.get(v.get("severity", ""), 0)
        for v in all_vulnerabilities
    )

    # Derive risk level from score
    if risk_score == 0:
        risk_level = "Safe"
    elif risk_score < 10:
        risk_level = "Low Risk"
    elif risk_score < 30:
        risk_level = "Medium Risk"
    elif risk_score < 60:
        risk_level = "High Risk"
    else:
        risk_level = "Critical Risk"

    return {
        "total_vulnerabilities": len(all_vulnerabilities),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "chunks_scanned": len(chunks),
        "vulnerabilities": all_vulnerabilities,
    }
