import subprocess
import re
import xml.etree.ElementTree as ET
from pathlib import Path

# Severity mapping for Flawfinder
FLAWFINDER_SEVERITY_NAMES = {
    0: "Very Low Risk",
    1: "Low Risk", 
    2: "Low-Medium Risk",
    3: "Moderate Risk",
    4: "High Risk",
    5: "Critical Risk"
}

# Severity mapping for Cppcheck
CPPCHECK_SEVERITY_NAMES = {
    "warning": "High Risk",
    "style": "Low-Medium Risk",
    "information": "Very Low Risk"
}

def detect_language(file_path):
    """Automatically detect language from file extension"""
    if file_path.endswith(('.cpp', '.cc', '.cxx', '.c++')):
        return "CPP"
    elif file_path.endswith('.hpp'):
        return "CPP"
    elif file_path.endswith('.c'):
        return "C"
    else:
        return "C"

def run_flawfinder(file_path):
    """Run flawfinder and return output"""
    try:
        command = [
            "flawfinder",
            "--columns",
            "--context",
            "--dataonly",
            "--html",
            file_path
        ]
        
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        return result.stdout
    except:
        return ""

def parse_flawfinder_output(output, language):
    """Parse flawfinder HTML output and extract findings"""
    findings = []
    
    if not output or "No hits found" in output:
        return findings
    
    pattern = re.compile(
        r'<li>([^:]+):(\d+):(\d+):\s*<b>\s*\[\s*(\d+)\s*\]\s*</b>\s*\(([^)]+)\)\s*<i>(.*?)</i>.*?<pre>\s*(.*?)\s*</pre>',
        re.DOTALL
    )
    
    matches = pattern.findall(output)
    
    for match in matches:
        try:
            line = int(match[1])
            column = int(match[2])
            severity_num = int(match[3])
            full_message = match[5].strip()
            evidence_code = match[6].strip()
            
            severity_name = FLAWFINDER_SEVERITY_NAMES.get(severity_num, "Unknown Risk")
            
            cwes = re.findall(r'CWE-(\d+)', full_message)
            cwes = [f"CWE-{cwe}" for cwe in cwes]
            
            reason = re.sub(r'<[^>]+>', '', full_message)
            reason = re.sub(r'\s+', ' ', reason)
            reason = reason.strip()
            reason = re.sub(r'href="[^"]*"', '', reason)
            reason = re.sub(r'https?://[^\s]+', '', reason)
            
            cwes_str = " ".join(cwes) if cwes else ""
            
            findings.append({
                "tool": "flawfinder",
                "vul_line_location": f"line: {line} and column: {column} - {severity_name}",
                "vul_detected_line": evidence_code,
                "possible_cwes": cwes_str,
                "reason": reason
            })
        except:
            continue
    
    return findings

def run_cppcheck(file_path):
    """Run cppcheck and return XML output"""
    try:
        command = [
            "cppcheck",
            "--enable=all",
            "--xml",
            "--xml-version=2",
            file_path
        ]
        
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        return result.stderr
    except:
        return ""

def clean_reason(text):
    """Clean up reason text by removing links, newlines, and extra spaces"""
    text = re.sub(r'https?://[^\s]+', '', text)
    text = re.sub(r'Source: [^\n]+', '', text)
    text = text.replace('\\012', ' ')
    text = ' '.join(text.split())
    return text.strip()

def parse_cppcheck_output(xml_output, file_path):
    """Parse cppcheck XML output and extract findings"""
    findings = []
    
    if not xml_output or "<?xml" not in xml_output:
        return findings
    
    try:
        root = ET.fromstring(xml_output)
    except:
        return findings
    
    language = detect_language(file_path)
    
    for error in root.findall('.//error'):
        try:
            error_id = error.get('id', '')
            severity = error.get('severity', '')
            msg = error.get('msg', '')
            cwe = error.get('cwe', '')
            
            if error_id == "missingIncludeSystem" or error_id == "checkersReport":
                continue
            
            location = error.find('location')
            if location is not None:
                line = location.get('line', '0')
                column = location.get('column', '0')
            else:
                line = '0'
                column = '0'
            
            severity_name = CPPCHECK_SEVERITY_NAMES.get(severity, "Very Low Risk")
            cwes_str = f"CWE-{cwe}" if cwe else ""
            reason = clean_reason(msg)
            
            findings.append({
                "tool": "cppcheck",
                "vul_line_location": f"line: {line} and column: {column} - {severity_name}",
                "possible_cwes": cwes_str,
                "reason": reason
            })
        except:
            continue
    
    return findings

def analyze_file(file_path):
    """Main function to analyze a file with both tools"""
    if not Path(file_path).exists():
        return "findings: Code is safe"
    
    language = detect_language(file_path)
    all_findings = []
    
    # Run Flawfinder
    flawfinder_output = run_flawfinder(file_path)
    flawfinder_findings = parse_flawfinder_output(flawfinder_output, language)
    all_findings.extend(flawfinder_findings)
    
    # Run Cppcheck
    cppcheck_output = run_cppcheck(file_path)
    cppcheck_findings = parse_cppcheck_output(cppcheck_output, file_path)
    all_findings.extend(cppcheck_findings)
    
    # Generate TOON output
    toon_output = []
    if not all_findings:
        return "findings: Code is safe"
    else:
        for i, finding in enumerate(all_findings):
            toon_output.append(f"finding_{i+1}")
            toon_output.append(f"  file_language: {language} file")
            toon_output.append(f"  vul_line_location: {finding['vul_line_location']}")
            if 'vul_detected_line' in finding:
                toon_output.append(f"  vul_detected_line: {finding['vul_detected_line']}")
            toon_output.append(f"  possible_cwes: {finding['possible_cwes']}")
            toon_output.append(f"  reason: {finding['reason']}")
            toon_output.append("")
        
        return "\n".join(toon_output)