"""
cwe_definitions.py

Defines the 26 CWE vulnerabilities scanned for in C/C++ source code,
and provides a helper to format them as an LLM prompt string.
"""

from typing import List, Dict


CWE_LIST: List[Dict[str, str]] = [
    {
        "id": "CWE-20",
        "name": "Improper Input Validation",
        "description": "Untrusted data is not properly validated before use, leading to injection attacks or logic errors.",
        "severity": "High",
    },
    {
        "id": "CWE-118",
        "name": "Out-of-bounds Access",
        "description": "Incorrect access of indexable resource outside its valid range.",
        "severity": "High",
    },
    {
        "id": "CWE-119",
        "name": "Memory Buffer Error",
        "description": "Software reads or writes outside allocated memory leading to crashes or exploitation.",
        "severity": "Critical",
    },
    {
        "id": "CWE-120",
        "name": "Classic Buffer Overflow",
        "description": "Unsafe copying of data into fixed-size buffers without size checks.",
        "severity": "Critical",
    },
    {
        "id": "CWE-121",
        "name": "Stack-based Buffer Overflow",
        "description": "Stack memory is overwritten due to unsafe input handling.",
        "severity": "Critical",
    },
    {
        "id": "CWE-122",
        "name": "Heap-based Buffer Overflow",
        "description": "Overflow in dynamically allocated memory, often exploitable for attacks.",
        "severity": "Critical",
    },
    {
        "id": "CWE-125",
        "name": "Out-of-bounds Read",
        "description": "Program reads memory outside valid buffer range, leaking or crashing data.",
        "severity": "High",
    },
    {
        "id": "CWE-127",
        "name": "Buffer Under-read",
        "description": "Program reads memory just before the start of a buffer, leaking sensitive data.",
        "severity": "High",
    },
    {
        "id": "CWE-134",
        "name": "Format String Vulnerability",
        "description": "Untrusted input used directly in printf-family functions allowing memory attacks.",
        "severity": "Critical",
    },
    {
        "id": "CWE-170",
        "name": "Improper Null Termination",
        "description": "Strings not properly null-terminated causing functions to read beyond buffer boundaries.",
        "severity": "High",
    },
    {
        "id": "CWE-190",
        "name": "Integer Overflow",
        "description": "Arithmetic exceeds storage limits leading to unexpected behavior or security issues.",
        "severity": "High",
    },
    {
        "id": "CWE-191",
        "name": "Integer Underflow",
        "description": "Values go below minimum limit causing logic errors or memory issues.",
        "severity": "High",
    },
    {
        "id": "CWE-193",
        "name": "Off-by-one Error",
        "description": "Loop boundaries or buffer size calculations off by exactly one causing out-of-bounds access.",
        "severity": "High",
    },
    {
        "id": "CWE-362",
        "name": "Race Condition (TOCTOU)",
        "description": "Resource state changes between check and use allowing attackers to exploit the timing gap.",
        "severity": "Medium",
    },
    {
        "id": "CWE-401",
        "name": "Memory Leak",
        "description": "Allocated memory is not properly freed causing resource exhaustion over time.",
        "severity": "Medium",
    },
    {
        "id": "CWE-415",
        "name": "Double Free",
        "description": "Memory is freed more than once leading to heap corruption.",
        "severity": "Critical",
    },
    {
        "id": "CWE-416",
        "name": "Use After Free",
        "description": "Freed memory is accessed again causing crashes or code execution risks.",
        "severity": "Critical",
    },
    {
        "id": "CWE-457",
        "name": "Use of Uninitialized Variable",
        "description": "Memory is read before being assigned a value leading to unpredictable behavior.",
        "severity": "High",
    },
    {
        "id": "CWE-476",
        "name": "NULL Pointer Dereference",
        "description": "Accessing invalid memory through a null pointer causing crashes.",
        "severity": "High",
    },
    {
        "id": "CWE-665",
        "name": "Improper Initialization",
        "description": "Objects or resources not correctly initialized before use leading to undefined behavior.",
        "severity": "Medium",
    },
    {
        "id": "CWE-680",
        "name": "Integer Overflow to Buffer Overflow",
        "description": "Integer overflow in size calculations leads to allocating too little memory then overflowing it.",
        "severity": "Critical",
    },
    {
        "id": "CWE-763",
        "name": "Invalid Pointer Release",
        "description": "Program attempts to free memory never allocated, already freed, or pointing to stack memory.",
        "severity": "Critical",
    },
    {
        "id": "CWE-787",
        "name": "Out-of-bounds Write",
        "description": "Data written outside buffer limits leading to memory corruption.",
        "severity": "Critical",
    },
    {
        "id": "CWE-806",
        "name": "Buffer Access Using Source Size",
        "description": "Destination buffer size determined by source size rather than destination capacity causing overflow.",
        "severity": "High",
    },
    {
        "id": "CWE-824",
        "name": "Access of Uninitialized Pointer",
        "description": "Pointer used before being assigned a valid address causing crashes or arbitrary memory access.",
        "severity": "Critical",
    },
    {
        "id": "CWE-843",
        "name": "Type Confusion",
        "description": "Program treats memory as the wrong type leading to memory corruption or code execution.",
        "severity": "Critical",
    },
]


def get_cwe_prompt_text() -> str:
    """
    Return a formatted string listing all 26 CWEs for use in an LLM prompt.

    Format per line:
        - CWE-XX (Severity): Name — Description
    """
    lines = ["Scan ONLY for these 26 CWE vulnerabilities relevant to C/C++:\n"]
    for cwe in CWE_LIST:
        lines.append(
            f"- {cwe['id']} ({cwe['severity']}): {cwe['name']} — {cwe['description']}"
        )
    return "\n".join(lines)
