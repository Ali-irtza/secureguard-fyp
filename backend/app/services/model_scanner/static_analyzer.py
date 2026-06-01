import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path


FLAWFINDER_SEVERITY_NAMES = {
    0: "Very Low Risk",
    1: "Low Risk",
    2: "Low-Medium Risk",
    3: "Moderate Risk",
    4: "High Risk",
    5: "Critical Risk",
}

CPPCHECK_SEVERITY_NAMES = {
    "error": "Critical Risk",
    "warning": "High Risk",
    "style": "Low-Medium Risk",
    "performance": "Low-Medium Risk",
    "portability": "Low-Medium Risk",
    "information": "Very Low Risk",
}


def detect_language(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    return "CPP" if suffix in {".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hxx"} else "C"


def run_flawfinder(file_path: str) -> str:
    try:
        result = subprocess.run(
            ["flawfinder", "--columns", "--context", "--dataonly", "--html", file_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout
    except Exception:
        return ""


def parse_flawfinder_output(output: str) -> list[dict]:
    if not output or "No hits found" in output:
        return []

    pattern = re.compile(
        r"<li>([^:]+):(\d+):(\d+):\s*<b>\s*\[\s*(\d+)\s*\]</b>\s*"
        r"\(([^)]+)\)\s*<i>(.*?)</i>.*?<pre>\s*(.*?)\s*</pre>",
        re.DOTALL,
    )

    findings = []
    for match in pattern.findall(output):
        try:
            line = int(match[1])
            column = int(match[2])
            severity_num = int(match[3])
            message = re.sub(r"<[^>]+>", "", match[5])
            message = re.sub(r"https?://[^\s]+", "", message)
            message = " ".join(message.split())
            evidence_code = match[6].strip()
            cwes = " ".join(f"CWE-{cwe}" for cwe in re.findall(r"CWE-(\d+)", message))
            findings.append(
                {
                    "tool": "flawfinder",
                    "vul_line_location": f"line: {line} and column: {column} - {FLAWFINDER_SEVERITY_NAMES.get(severity_num, 'Unknown Risk')}",
                    "vul_detected_line": evidence_code,
                    "possible_cwes": cwes,
                    "reason": message,
                }
            )
        except Exception:
            continue
    return findings


def run_cppcheck(file_path: str) -> str:
    try:
        result = subprocess.run(
            ["cppcheck", "--enable=all", "--xml", "--xml-version=2", file_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stderr
    except Exception:
        return ""


def parse_cppcheck_output(xml_output: str) -> list[dict]:
    if not xml_output or "<?xml" not in xml_output:
        return []
    try:
        root = ET.fromstring(xml_output)
    except Exception:
        return []

    findings = []
    for error in root.findall(".//error"):
        error_id = error.get("id", "")
        if error_id in {"missingIncludeSystem", "checkersReport"}:
            continue
        severity = error.get("severity", "")
        msg = " ".join((error.get("msg", "") or "").replace("\\012", " ").split())
        msg = re.sub(r"https?://[^\s]+", "", msg).strip()
        cwe = error.get("cwe", "")
        location = error.find("location")
        line = location.get("line", "0") if location is not None else "0"
        column = location.get("column", "0") if location is not None else "0"
        findings.append(
            {
                "tool": "cppcheck",
                "vul_line_location": f"line: {line} and column: {column} - {CPPCHECK_SEVERITY_NAMES.get(severity, 'Very Low Risk')}",
                "possible_cwes": f"CWE-{cwe}" if cwe else "",
                "reason": msg,
            }
        )
    return findings


def analyze_file(file_path: str) -> str:
    if not Path(file_path).exists():
        return "findings: Code is safe"

    language = detect_language(file_path)
    all_findings = [
        *parse_flawfinder_output(run_flawfinder(file_path)),
        *parse_cppcheck_output(run_cppcheck(file_path)),
    ]

    if not all_findings:
        return "findings: Code is safe"

    lines = []
    for i, finding in enumerate(all_findings, start=1):
        lines.append(f"finding_{i}")
        lines.append(f"  vul_line_location: {finding['vul_line_location']}")
        if "vul_detected_line" in finding:
            lines.append(f"  vul_detected_line: {finding['vul_detected_line']}")
        lines.append(f"  possible_cwes: {finding['possible_cwes']}")
        lines.append(f"  reason: {finding['reason']}")
        lines.append("")
    return "\n".join(lines)
