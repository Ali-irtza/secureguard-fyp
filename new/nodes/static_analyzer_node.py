from pathlib import Path
from typing import TypedDict
import sys
import os

# Add parent directory to path to import static_analyzer
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from static_analyzer import analyze_file

LOG_FILE = Path(__file__).parent.parent / "static_findings.log"

class AnalyzerState(TypedDict, total=False):
    file_path: str
    original_code: str
    language: str
    static_findings: str
    system_prompt: str
    model_task: str
    cwe_model_response: str
    cwe_model_error: str
    missing_cwe_model_response: str
    code_model_response: str
    code_model_error: str
    code_retry_response: str
    first_model_response: str
    model_response: str
    vulnerabilities: list[dict]
    corrected_code: str
    confidence_score: float
    final_confidence_score: float
    correct_cwes: list[str]
    missing_cwes: list[str]
    missing_findings: str
    removed_cwes: list[str]
    corrected_code_findings: str
    corrected_code_is_clean: bool
    final_corrected_code_findings: str
    final_corrected_code_is_clean: bool
    final_response: str
    retry_count: int
    code_retry_count: int
    missing_retry_error: str
    code_retry_error: str
    error: str

def read_file_content(file_path: str) -> str:
    """Read source code file content"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"

def static_analyzer_node(state: AnalyzerState) -> AnalyzerState:
    """Node 1: Run static analysis on the file"""
    print("\n[Node 1] Running static analysis...")
    
    file_path = state["file_path"]
    
    # Run static analysis
    findings = analyze_file(file_path)
    LOG_FILE.write_text(findings, encoding="utf-8")
    
    # Read original code
    original_code = read_file_content(file_path)
    
    # Detect language from file extension
    if file_path.endswith(('.cpp', '.cc', '.cxx', '.c++')):
        language = "CPP"
    else:
        language = "C"
    
    print(f"  Static analysis complete")
    print(f"  Findings saved to {LOG_FILE}")
    
    return {
        **state,
        "static_findings": findings,
        "original_code": original_code,
        "language": language
    }
