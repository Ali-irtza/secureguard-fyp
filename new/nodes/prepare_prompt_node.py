from pathlib import Path
from typing import TypedDict

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

def load_system_prompt(findings: str) -> str:
    """Load and inject findings into system prompt"""
    # Get the prompt folder path (relative to this file: /new/prompt/system_prompt.md)
    current_dir = Path(__file__).parent.parent
    prompt_path = current_dir / "prompt" / "system_prompt.md"
    
    if not prompt_path.exists():
        # Fallback prompt if file doesn't exist
        return f"""You are a C/C++ vulnerability analyzer. Analyze the code and static findings below.

Static Analysis Findings:
{findings}

Return JSON only with fields: input, language, is_vulnerable, vulnerabilities, corrected_code"""
    
    with open(prompt_path, "r", encoding="utf-8") as f:
        prompt_template = f.read()
    
    # Inject findings into template
    return prompt_template.replace("{findings}", findings)

def prepare_prompt_node(state: AnalyzerState) -> AnalyzerState:
    """Node 2: Prepare system prompt with findings"""
    print("\n[Node 2] Preparing system prompt...")
    
    # Load and inject findings into system prompt
    system_prompt = load_system_prompt(state["static_findings"])
    
    print(f"  System prompt prepared (length: {len(system_prompt)} chars)")
    
    return {
        **state,
        "system_prompt": system_prompt
    }
