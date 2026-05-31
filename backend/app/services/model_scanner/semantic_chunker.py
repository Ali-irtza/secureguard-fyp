"""
Fast C/C++ semantic chunker for model input preparation.

Edit TARGET_FILE below, then run:
    python run.py

The script writes:
    chunk_output.txt  -> model-ready chunks with relevant context
    chunk_report.txt  -> speed, syntax status, and chunk summary

It never sends code to a model. It only prepares clean chunks.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import bisect
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


# Manually change this file name.
TARGET_FILE = "sample_cpp_pro.cpp"


ROOT = Path(__file__).resolve().parent
OUTPUT_FILE = ROOT / "chunk_output.txt"
REPORT_FILE = ROOT / "chunk_report.txt"
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_DEPENDENCY_PASSES = 32
TEMPLATE_ARG_PATTERN = r"<(?:[^<>{};]|<[^<>{};]*>)*>"


C_EXTENSIONS = {".c", ".h"}
CPP_EXTENSIONS = {".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"}
IDENT_RE = re.compile(r"\b[^\W\d]\w*\b", re.UNICODE)
CALL_RE = re.compile(r"\b([^\W\d]\w*)\s*\(", re.UNICODE)

CONTROL_KEYWORDS = {
    "if",
    "for",
    "while",
    "switch",
    "return",
    "sizeof",
    "catch",
    "new",
    "delete",
    "static_cast",
    "reinterpret_cast",
    "const_cast",
    "dynamic_cast",
    "operator",
    "static_assert",
    "alignas",
    "alignof",
    "requires",
}

C_CPP_KEYWORDS = {
    "auto",
    "bool",
    "break",
    "case",
    "char",
    "class",
    "const",
    "continue",
    "default",
    "do",
    "double",
    "else",
    "enum",
    "extern",
    "float",
    "goto",
    "int",
    "long",
    "namespace",
    "private",
    "protected",
    "public",
    "register",
    "return",
    "short",
    "signed",
    "sizeof",
    "static",
    "struct",
    "switch",
    "template",
    "typedef",
    "union",
    "unsigned",
    "using",
    "void",
    "volatile",
    "while",
    "constexpr",
    "decltype",
    "concept",
    "requires",
    "noexcept",
    "nullptr",
    "override",
    "final",
    "consteval",
    "constinit",
    "co_await",
    "co_return",
    "co_yield",
    "thread_local",
    "static_assert",
    "alignas",
    "alignof",
    "import",
    "module",
    "export",
    "typename",
    "concept",
}


@dataclass
class LineIndex:
    text: str
    starts: list[int]

    @classmethod
    def build(cls, text: str) -> "LineIndex":
        starts = [0]
        for match in re.finditer("\n", text):
            starts.append(match.end())
        return cls(text=text, starts=starts)

    def line_no(self, offset: int) -> int:
        return bisect.bisect_right(self.starts, offset)


@dataclass
class Unit:
    kind: str
    name: str
    code: str
    start_line: int
    end_line: int
    identifiers: set[str] = field(default_factory=set)
    calls: set[str] = field(default_factory=set)


@dataclass
class ParseResult:
    language: str
    syntax_ok: bool
    syntax_command: str
    syntax_output: str
    includes: list[str]
    imports: list[str]
    pragmas: list[str]
    macros: list[str]
    preprocessor_blocks: list[str]
    extern_blocks: list[Unit]
    asm_blocks: list[Unit]
    forward_declarations: list[Unit]
    declarations: list[Unit]
    type_units: list[Unit]
    global_units: list[Unit]
    functions: list[Unit]
    loose_blocks: list[Unit]


def line_no_from_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def mask_comments_and_strings(code: str) -> str:
    """Return code with comments/strings/chars masked, preserving offsets and newlines."""
    out = list(code)
    i = 0
    state = "code"
    escape = False
    while i < len(code):
        ch = code[i]
        nxt = code[i + 1] if i + 1 < len(code) else ""
        if state == "code":
            raw = re.match(r'(?:u8|u|U|L)?R"([^\s()\\]{0,16})\(', code[i:])
            if raw:
                delim = raw.group(1)
                end_token = ")" + delim + '"'
                end = code.find(end_token, i + raw.end())
                if end >= 0:
                    end += len(end_token)
                    for j in range(i, end):
                        if code[j] != "\n":
                            out[j] = " "
                    i = end
                    continue
            if ch == "/" and nxt == "/":
                out[i] = out[i + 1] = " "
                i += 2
                state = "line_comment"
                continue
            if ch == "/" and nxt == "*":
                out[i] = out[i + 1] = " "
                i += 2
                state = "block_comment"
                continue
            if ch == '"':
                out[i] = " "
                state = "string"
            elif ch == "'":
                out[i] = " "
                state = "char"
        elif state == "line_comment":
            if ch == "\n":
                state = "code"
            else:
                out[i] = " "
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                out[i] = out[i + 1] = " "
                i += 2
                state = "code"
                continue
            if ch != "\n":
                out[i] = " "
        elif state == "string":
            if escape:
                escape = False
                if ch != "\n":
                    out[i] = " "
                else:
                    out[i] = " "
            elif ch == "\\":
                escape = True
                out[i] = " "
            elif ch == '"':
                out[i] = " "
                state = "code"
            elif ch != "\n":
                out[i] = " "
        elif state == "char":
            if escape:
                escape = False
                if ch != "\n":
                    out[i] = " "
            elif ch == "\\":
                escape = True
                out[i] = " "
            elif ch == "'":
                out[i] = " "
                state = "code"
            elif ch != "\n":
                out[i] = " "
        i += 1
    return "".join(out)


def strip_comments_and_strings_for_scan(code: str) -> str:
    return mask_comments_and_strings(code)


def normalize_digraphs(text: str) -> str:
    return (
        text.replace("<%", "{")
        .replace("%>", "}")
        .replace("<:", "[")
        .replace(":>", "]")
        .replace("%:", "#")
    )


def mask_inactive_preprocessor_blocks(text: str) -> str:
    """Mask simple inactive #if 0 blocks so their braces do not affect structural parsing."""
    lines = text.splitlines(keepends=True)
    out = list(lines)
    stack: list[bool] = []
    inactive_depth = 0
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        if stripped.startswith("#if 0"):
            stack.append(True)
            inactive_depth += 1
            out[i] = line
            continue
        if stripped.startswith(("#if", "#ifdef", "#ifndef")):
            stack.append(False)
            out[i] = line
            continue
        if stripped.startswith("#endif"):
            if stack:
                was_inactive = stack.pop()
                if was_inactive:
                    inactive_depth = max(0, inactive_depth - 1)
            out[i] = line
            continue
        if stripped.startswith("#else") and stack:
            if stack[-1]:
                stack[-1] = False
                inactive_depth = max(0, inactive_depth - 1)
            else:
                stack[-1] = True
                inactive_depth += 1
            out[i] = line
            continue
        if inactive_depth > 0 and not stripped.startswith("#"):
            out[i] = "".join("\n" if ch == "\n" else " " for ch in line)
    return "".join(out)


def mask_preprocessor_directives(masked: str) -> str:
    """Mask active preprocessor directive lines, including backslash continuations."""
    lines = masked.splitlines(keepends=True)
    out = list(lines)
    in_continuation = False
    for i, line in enumerate(lines):
        stripped = line.lstrip()
        is_directive = in_continuation or stripped.startswith("#")
        if is_directive:
            out[i] = "".join("\n" if ch == "\n" else " " for ch in line)
        in_continuation = is_directive and line.rstrip().endswith("\\")
    return "".join(out)


def find_template_end(text: str, open_index: int) -> int:
    depth = 0
    i = open_index
    while i < len(text):
        ch = text[i]
        if ch == "<":
            depth += 1
        elif ch == ">":
            if i + 1 < len(text) and text[i + 1] == ">" and depth > 1:
                depth -= 2
                i += 1
                if depth <= 0:
                    return i
            else:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def find_balanced_call_end(text: str, open_index: int) -> int:
    return find_matching_paren(text, open_index)


def find_matching_paren(masked: str, open_index: int) -> int:
    depth = 0
    for i in range(open_index, len(masked)):
        ch = masked[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
    return -1


def previous_nonspace(text: str, index: int) -> str:
    i = index - 1
    while i >= 0 and text[i].isspace():
        i -= 1
    return text[i] if i >= 0 else ""


def find_function_body_open(masked: str, params_close: int) -> int:
    """Find the real body brace after a function signature.

    Constructor initializer lists can contain top-level braced initializers, for
    example Class() : member{{1, 2}}, other(3) { ... }. Those braces are not the
    function body, so this scanner skips them before returning the body brace.
    """
    i = params_close + 1
    paren = bracket = brace = angle = 0
    in_initializer = False
    while i < len(masked):
        ch = masked[i]
        nxt = masked[i + 1] if i + 1 < len(masked) else ""

        if paren == bracket == brace == angle == 0:
            if ch == ";":
                return -1
            if ch == ":":
                in_initializer = True
                i += 1
                continue
            if ch == "{":
                if not in_initializer:
                    return i
                prev = previous_nonspace(masked, i)
                if prev in ")}]}>":
                    return i
                brace = 1
                i += 1
                continue

        if ch == "(":
            paren += 1
        elif ch == ")" and paren:
            paren -= 1
        elif ch == "[":
            bracket += 1
        elif ch == "]" and bracket:
            bracket -= 1
        elif ch == "{":
            brace += 1
        elif ch == "}" and brace:
            brace -= 1
        elif ch == "<" and not (nxt == "<"):
            angle += 1
        elif ch == ">" and angle:
            angle -= 1

        i += 1
    return -1


def collect_template_identifiers(cleaned: str) -> set[str]:
    found: set[str] = set()
    for match in IDENT_RE.finditer(cleaned):
        name = match.group(0)
        if name in C_CPP_KEYWORDS:
            continue
        i = match.end()
        while i < len(cleaned) and cleaned[i].isspace():
            i += 1
        if i < len(cleaned) and cleaned[i] == "<":
            end = find_template_end(cleaned, i)
            if end > i:
                found.add(name)
                inside = cleaned[i + 1 : end]
                found.update(tok for tok in IDENT_RE.findall(inside) if tok not in C_CPP_KEYWORDS)
    return found


def is_lambda_signature(masked: str, signature_start: int, open_brace: int) -> bool:
    prefix = masked[signature_start:open_brace]
    close = prefix.rfind("]")
    if close < 0:
        return False
    open_sq = prefix.rfind("[", 0, close)
    if open_sq < 0:
        return False
    after = prefix[close + 1 :].lstrip()
    if not after.startswith("("):
        return False
    # Handles captures such as [&, this, x = std::move(y)](...) mutable noexcept -> int {
    return True


def skip_attributes(masked: str, index: int) -> int:
    i = index
    while True:
        while i < len(masked) and masked[i].isspace():
            i += 1
        if masked.startswith("[[", i):
            end = masked.find("]]", i + 2)
            if end < 0:
                return i
            i = end + 2
            continue
        if masked.startswith("__attribute__", i):
            open_paren = masked.find("((", i)
            if open_paren >= 0:
                end = masked.find("))", open_paren + 2)
                if end >= 0:
                    i = end + 2
                    continue
        if masked.startswith("__declspec", i):
            open_paren = masked.find("(", i)
            end = find_balanced_call_end(masked, open_paren) if open_paren >= 0 else -1
            if end >= 0:
                i = end + 1
                continue
        attr = re.match(r"(?:__attribute__\s*\(\([^)]*\)\)|__declspec\s*\([^)]*\))", masked[i:])
        if attr:
            i += attr.end()
            continue
        return i


def find_matching_brace(text: str, open_index: int) -> int:
    depth = 0
    i = open_index
    in_line_comment = False
    in_block_comment = False
    in_string = False
    in_char = False
    escape = False
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
        elif in_block_comment:
            if ch == "*" and nxt == "/":
                in_block_comment = False
                i += 1
        elif in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        elif in_char:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                in_char = False
        else:
            line_start = text.rfind("\n", 0, i) + 1
            if text[line_start:i].strip() == "" and ch == "#":
                newline = text.find("\n", i)
                if newline < 0:
                    return -1
                i = newline
                continue
            if ch == "/" and nxt == "/":
                in_line_comment = True
                i += 1
            elif ch == "/" and nxt == "*":
                in_block_comment = True
                i += 1
            elif ch == '"':
                in_string = True
            elif ch == "'":
                in_char = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1


def statement_start(text: str, index: int) -> int:
    prev = text.rfind("\n", 0, index)
    while prev > 0:
        line = text[prev + 1 : index].strip()
        if line.startswith(
            (
                "template",
                "static",
                "inline",
                "extern",
                "constexpr",
                "virtual",
                "friend",
                "void",
                "int",
                "char",
                "bool",
                "size_t",
                "auto",
                "const",
            )
        ):
            break
        prior = text.rfind("\n", 0, prev)
        if prior < 0:
            break
        prev = prior
        if index - prev > 500:
            break
    semi = text.rfind(";", 0, index)
    brace = text.rfind("}", 0, index)
    nl = text.rfind("\n", 0, index)
    return max(semi + 1, brace + 1, nl + 1, 0)


def statement_start_scan(masked: str, index: int) -> int:
    i = index - 1
    depth_paren = depth_angle = depth_bracket = 0
    while i >= 0:
        ch = masked[i]
        if ch == ")":
            depth_paren += 1
        elif ch == "(":
            depth_paren = max(0, depth_paren - 1)
        elif ch == ">":
            depth_angle += 1
        elif ch == "<":
            depth_angle = max(0, depth_angle - 1)
        elif ch == "]":
            depth_bracket += 1
        elif ch == "[":
            depth_bracket = max(0, depth_bracket - 1)
        if depth_paren == depth_angle == depth_bracket == 0 and ch in ";{}":
            return i + 1
        i -= 1
    return 0


def type_statement_start(masked: str, index: int) -> int:
    """Return declaration start for a type, including nearby template/attribute prefixes."""
    start = masked.rfind("\n", 0, index) + 1
    cursor = start
    while cursor > 0:
        prev_end = cursor - 1
        prev_start = masked.rfind("\n", 0, prev_end - 1) + 1 if prev_end > 0 else 0
        line = masked[prev_start:prev_end].strip()
        if not line:
            break
        if line.startswith(("template", "[[", "__attribute__", "__declspec", "alignas")):
            cursor = prev_start
            continue
        break
    return cursor


def extract_names(code: str) -> tuple[set[str], set[str]]:
    cleaned = strip_comments_and_strings_for_scan(code)
    cleaned = re.sub(r"\bstatic_assert\s*\([^;]*\);", " ", cleaned)
    cleaned = re.sub(r"\b(?:alignas|alignof)\s*\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\b(?:const\s+)?auto\s*(?:&{1,2})?\s*\[[^\]]+\]\s*=", " ", cleaned)
    cleaned = re.sub(r"(?<![A-Za-z0-9_])\.[A-Za-z_][A-Za-z0-9_]*\s*=", " = ", cleaned)
    cleaned = re.sub(r"\([^()]*\.\.\.[^()]*\)", " ", cleaned)
    identifiers = {x for x in IDENT_RE.findall(cleaned) if x not in C_CPP_KEYWORDS}
    qualified = re.findall(r"\b([^\W\d]\w*)::([^\W\d]\w*)\b", cleaned, flags=re.UNICODE)
    for left, right in qualified:
        identifiers.add(left)
        identifiers.add(right)
        identifiers.add(f"{left}::{right}")
    template_refs = re.findall(rf"\b([^\W\d]\w*(?:::[^\W\d]\w*)*)\s*({TEMPLATE_ARG_PATTERN})", cleaned, flags=re.UNICODE)
    for base, args in template_refs:
        identifiers.update(part for part in re.findall(IDENT_RE, base) if part not in C_CPP_KEYWORDS)
        identifiers.update(part for part in re.findall(IDENT_RE, args) if part not in C_CPP_KEYWORDS)
    identifiers.update(collect_template_identifiers(cleaned))
    calls = {x for x in CALL_RE.findall(cleaned) if x not in CONTROL_KEYWORDS and x != "operator"}
    return identifiers, calls


def detect_language(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in C_EXTENSIONS:
        return "C"
    if ext in CPP_EXTENSIONS:
        return "CPP"
    raise ValueError(f"Unsupported extension: {path.suffix}")


def syntax_check(path: Path, language: str) -> tuple[bool, str, str]:
    compiler = "gcc" if language == "C" else "g++"
    exe = shutil.which(compiler)
    if not exe:
        return True, f"{compiler} not found", "Compiler not found; syntax check skipped."
    cmd = [exe, "-fsyntax-only", "-Wno-everything", str(path)]
    if language == "CPP":
        cmd.insert(1, "-std=c++20")
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        output = (completed.stdout + completed.stderr).strip()
        return completed.returncode == 0, " ".join(cmd), output
    except subprocess.TimeoutExpired:
        return False, " ".join(cmd), "Syntax check timed out."


def extract_line_directives(text: str) -> tuple[list[str], list[str], list[str], list[str], list[str]]:
    includes = []
    imports = []
    pragmas = []
    macros = []
    preprocessor_blocks = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith("#include"):
            includes.append(line)
        elif stripped.startswith(("import ", "export import ", "export module", "module ")):
            imports.append(line)
        elif stripped.startswith("#pragma"):
            pragmas.append(line)
        elif stripped.startswith("#define"):
            block = [line]
            while block[-1].rstrip().endswith("\\") and i + 1 < len(lines):
                i += 1
                block.append(lines[i])
            macros.append("\n".join(block))
        elif stripped.startswith(("#if", "#ifdef", "#ifndef", "#elif", "#else", "#endif")):
            preprocessor_blocks.append(line)
        i += 1
    return includes, imports, pragmas, macros, preprocessor_blocks


def extract_forward_declarations(text: str, line_index: LineIndex) -> list[Unit]:
    masked = mask_comments_and_strings(text)
    forwards = []
    pattern = re.compile(
        rf"^\s*(?:template\s*{TEMPLATE_ARG_PATTERN}\s*)?(struct|class|union|enum)\s+([^\W\d]\w*)\s*;",
        re.MULTILINE | re.UNICODE,
    )
    for match in pattern.finditer(masked):
        code = text[match.start() : match.end()].strip()
        ids, calls = extract_names(code)
        forwards.append(
            Unit(
                kind=f"{match.group(1)}_forward",
                name=match.group(2),
                code=code,
                start_line=line_index.line_no(match.start()),
                end_line=line_index.line_no(match.end()),
                identifiers=ids,
                calls=calls,
            )
        )
    return forwards


def extract_extern_and_asm(text: str, line_index: LineIndex) -> tuple[list[Unit], list[Unit], list[tuple[int, int]]]:
    masked = mask_comments_and_strings(text)
    externs: list[Unit] = []
    asms: list[Unit] = []
    spans: list[tuple[int, int]] = []
    extern_pat = re.compile(r'\bextern\s+"C(?:\+\+)?"\s*\{')
    for match in extern_pat.finditer(text):
        open_brace = text.find("{", match.start())
        close = find_matching_brace(text, open_brace)
        if close < 0:
            continue
        code = text[match.start() : close + 1].strip()
        ids, calls = extract_names(code)
        externs.append(
            Unit("extern_block", "extern_linkage", code, line_index.line_no(match.start()), line_index.line_no(close + 1), ids, calls)
        )
        spans.append((match.start(), close + 1))
    asm_pat = re.compile(r'\b(?:asm|__asm__|__asm)\s*(?:volatile\s*)?\([^;]*\)\s*;', re.MULTILINE)
    for match in asm_pat.finditer(masked):
        code = text[match.start() : match.end()].strip()
        ids, calls = extract_names(code)
        asms.append(Unit("asm", "asm_declaration", code, line_index.line_no(match.start()), line_index.line_no(match.end()), ids, calls))
        spans.append((match.start(), match.end()))
    return externs, asms, spans


def extract_function_declarations(text: str, covered_spans: list[tuple[int, int]], line_index: LineIndex) -> list[Unit]:
    mask = list(mask_comments_and_strings(text))
    for start, end in covered_spans:
        for i in range(start, min(end, len(mask))):
            if mask[i] != "\n":
                mask[i] = " "
    masked = "".join(mask)
    declarations: list[Unit] = []
    offset = 0
    for raw_line in masked.splitlines(keepends=True):
        line = raw_line.strip()
        start = offset + raw_line.find(raw_line.lstrip()) if line else offset
        end = offset + len(raw_line)
        offset = end
        if not line.endswith(";") or "(" not in line or "{" in line or "}" in line:
            continue
        if len(line) > 1000:
            continue
        code = text[start:end].strip()
        if not code or code.startswith(("if", "for", "while", "switch", "return")):
            continue
        if "->" in line or re.match(r"template\s+(?:class|struct)\b", line):
            continue
        name_match = re.search(r"(operator\s*(?:<=>|[^\s(]+)|~?[^\W\d]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept(?:\s*\([^)]*\))?\s*)?(?:=\s*(?:delete|default))?\s*;$", line, re.UNICODE)
        if not name_match:
            continue
        raw_name = re.sub(r"\s+", "", name_match.group(1))
        if raw_name in CONTROL_KEYWORDS or raw_name in C_CPP_KEYWORDS:
            continue
        ids, calls = extract_names(code)
        ids.add(raw_name)
        declarations.append(
            Unit(
                kind="declaration",
                name=raw_name,
                code=code,
                start_line=line_index.line_no(start),
                end_line=line_index.line_no(end),
                identifiers=ids,
                calls=calls,
            )
        )
    return declarations


def extract_braced_units(text: str, language: str, line_index: LineIndex) -> tuple[list[Unit], list[tuple[int, int]]]:
    units: list[Unit] = []
    spans: list[tuple[int, int]] = []
    masked = mask_preprocessor_directives(mask_comments_and_strings(text))

    type_pattern = re.compile(
        rf"(?:template\s*{TEMPLATE_ARG_PATTERN}\s*)?(?:template\s*<>\s*)?(?:\[\[[^\]]*\]\]\s*)?(?:typedef\s+)?\b(enum\s+class|enum|struct|union|class)\s*(?:alignas\s*\([^)]*\)\s*)?([^\W\d]\w*)?(?:\s*{TEMPLATE_ARG_PATTERN})?[^;{{]*\{{",
        re.MULTILINE | re.UNICODE,
    )
    for match in type_pattern.finditer(masked):
        match_start = type_statement_start(masked, match.start())
        if text[match_start:match.start()].strip().startswith("[["):
            match_start = skip_attributes(masked, match_start)
        open_brace = masked.find("{", match.start())
        close = find_matching_brace(text, open_brace)
        if close < 0:
            continue
        end = close + 1
        typedef_name = None
        if end < len(text) and text[end] == ";":
            end += 1
        else:
            typedef_tail = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*;", text[end:])
            if typedef_tail:
                typedef_name = typedef_tail.group(1)
                end += typedef_tail.end()
        code = text[match_start:end].strip()
        ids, calls = extract_names(code)
        name = match.group(2) or typedef_name or f"anonymous_{line_no_from_offset(text, match.start())}"
        units.append(
            Unit(
                kind=match.group(1).replace(" ", "_"),
                name=name,
                code=code,
                start_line=line_index.line_no(match_start),
                end_line=line_index.line_no(end),
                identifiers=ids,
                calls=calls,
            )
        )
        spans.append((match_start, end))

    operator_name = r"operator\s*(?:<=>|[^\W\d]\w*|[+\-*/%<>=!&|^~,\[\]()]+)"
    normal_name = r"[^\W\d~]\w*(?:::[^\W\d~]\w*)*|~[^\W\d]\w*"
    func_pattern = re.compile(
        rf"(?:template\s*{TEMPLATE_ARG_PATTERN}\s*)?(?:\[\[[^\]]*\]\]\s*)?(?:consteval\s+|constexpr\s+|constinit\s+|static\s+|inline\s+|virtual\s+|friend\s+|explicit\s+)*([^\n;{{}}=]*?)\s*(?:[*&]+\s*)?({operator_name}|{normal_name})\s*\([^;{{}}]*\)\s*(?:const\s*)?(?:&\s*|&&\s*)?(?:noexcept(?:\s*\([^)]*\))?\s*)?(?:requires\s+[^\{{;]+)?(?:override\s*)?(?:final\s*)?(?:\s*:\s*[^;{{}}]*)?\{{",
        re.MULTILINE,
    )
    for match in func_pattern.finditer(masked):
        line_start = masked.rfind("\n", 0, match.start()) + 1
        line_prefix = masked[line_start : match.start()]
        if ")" in line_prefix and line_prefix.rfind(":") > line_prefix.rfind(";"):
            continue
        params_open = masked.find("(", match.end(2))
        if params_open < 0:
            continue
        params_close = find_matching_paren(masked, params_open)
        if params_close < 0:
            continue
        open_brace = find_function_body_open(masked, params_close)
        signature = masked[match.start() : open_brace].strip() if open_brace >= 0 else ""
        if re.match(r"^(if|for|while|switch|catch|requires)\s*\(", signature):
            continue
        if is_lambda_signature(masked, match.start(), open_brace) or "=" in signature:
            continue
        raw_name = re.sub(r"\s+", "", match.group(2))
        name = raw_name
        if name in CONTROL_KEYWORDS:
            continue
        close = find_matching_brace(text, open_brace)
        if close < 0:
            continue
        start = statement_start_scan(masked, match.start())
        start = skip_attributes(masked, start)
        end = close + 1
        code = text[start:end].strip()
        ids, calls = extract_names(code)
        ids.add(raw_name.split("::")[-1])
        if "::" in raw_name:
            ids.add(raw_name)
            ids.update(raw_name.split("::"))
        units.append(
            Unit(
                kind="function",
                name=name,
                code=code,
                start_line=line_index.line_no(start),
                end_line=line_index.line_no(end),
                identifiers=ids,
                calls=calls,
            )
        )
        spans.append((start, end))

    units.sort(key=lambda u: u.start_line)
    spans.sort()
    return units, spans


def split_global_declarators(statement: str) -> list[tuple[str, str]]:
    if "," not in statement:
        name_match = re.search(
            r"(?:\*+\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*(?:=[^;]*)?;$",
            statement,
        )
        return [(name_match.group(1), statement)] if name_match else []
    prefix_match = re.match(r"(.+?\s)([^,;]+(?:,[^;]+)+);$", statement)
    if not prefix_match:
        return []
    prefix = prefix_match.group(1)
    declarators = prefix_match.group(2)
    out = []
    depth = 0
    current = []
    for ch in declarators:
        if ch in "([{<":
            depth += 1
        elif ch in ")]}>":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            part = "".join(current).strip()
            if part:
                name = re.search(r"(?:\*+\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*(?:=.*)?$", part)
                if name:
                    out.append((name.group(1), (prefix + part + ";").strip()))
            current = []
        else:
            current.append(ch)
    part = "".join(current).strip()
    if part:
        name = re.search(r"(?:\*+\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[[^\]]*\])?\s*(?:=.*)?$", part)
        if name:
            out.append((name.group(1), (prefix + part + ";").strip()))
    return out


def split_top_level_statements(masked: str) -> list[tuple[int, int]]:
    spans = []
    start = 0
    paren = bracket = angle = 0
    for i, ch in enumerate(masked):
        if ch == "(":
            paren += 1
        elif ch == ")":
            paren = max(0, paren - 1)
        elif ch == "[":
            bracket += 1
        elif ch == "]":
            bracket = max(0, bracket - 1)
        elif ch == "<":
            angle += 1
        elif ch == ">":
            angle = max(0, angle - 1)
        elif ch == ";" and paren == bracket == angle == 0:
            spans.append((start, i + 1))
            start = i + 1
    return spans


def extract_globals(text: str, covered_spans: list[tuple[int, int]], line_index: LineIndex) -> list[Unit]:
    mask = list(text)
    for start, end in covered_spans:
        for i in range(start, min(end, len(mask))):
            mask[i] = " "
    top = "".join(mask)
    globals_: list[Unit] = []
    masked_top = mask_comments_and_strings(top)
    for start_offset, end_offset in split_top_level_statements(masked_top):
        raw_statement = text[start_offset:end_offset]
        line = raw_statement.strip()
        if not line.endswith(";"):
            continue
        if line.startswith(("#", "return", "typedef", "using", "static_assert", "namespace", "import", "export", "module", "template")):
            continue
        if re.search(r"\b(class|struct|enum|union)\b", line):
            continue
        if re.search(r"\b(?:asm|__asm__|__asm)\b", line):
            continue
        masked_line = mask_comments_and_strings(line)
        if "(" in masked_line and not re.search(r"\(\s*[*&]?\s*[A-Za-z_]", masked_line):
            continue
        for name, declaration in split_global_declarators(line):
            if name in C_CPP_KEYWORDS:
                continue
            ids, calls = extract_names(declaration)
            globals_.append(
                Unit(
                    kind="global",
                    name=name,
                    code=declaration,
                    start_line=line_index.line_no(start_offset),
                    end_line=line_index.line_no(end_offset),
                    identifiers=ids,
                    calls=calls,
                )
            )
    return globals_


def extract_loose_blocks(text: str, covered_spans: list[tuple[int, int]], line_index: LineIndex) -> list[Unit]:
    uncovered = []
    last = 0
    for start, end in sorted(covered_spans):
        if last < start:
            part = text[last:start].strip()
            if part and len(part.splitlines()) >= 5:
                uncovered.append((last, start, part))
        last = end
    if last < len(text):
        part = text[last:].strip()
        if part and len(part.splitlines()) >= 5:
            uncovered.append((last, len(text), part))

    blocks = []
    for idx, (start, end, code) in enumerate(uncovered, 1):
        code = "\n".join(
            line
            for line in code.splitlines()
            if not line.strip().startswith(("#include", "#define"))
        ).strip()
        if not code:
            continue
        ids, calls = extract_names(code)
        blocks.append(
            Unit(
                kind="loose_block",
                name=f"top_level_block_{idx}",
                code=code,
                start_line=line_index.line_no(start),
                end_line=line_index.line_no(end),
                identifiers=ids,
                calls=calls,
            )
        )
    return blocks


def parse_source(path: Path) -> ParseResult:
    size = path.stat().st_size
    if size > MAX_FILE_BYTES:
        raise ValueError(f"File is too large for single-file chunking: {size} bytes > {MAX_FILE_BYTES} bytes")
    text = path.read_text(encoding="utf-8", errors="replace")
    text = mask_inactive_preprocessor_blocks(normalize_digraphs(text))
    line_index = LineIndex.build(text)
    language = detect_language(path)
    syntax_ok, syntax_command, syntax_output = syntax_check(path, language)
    includes, imports, pragmas, macros, preprocessor_blocks = extract_line_directives(text)
    forward_declarations = extract_forward_declarations(text, line_index)
    extern_blocks, asm_blocks, extern_spans = extract_extern_and_asm(text, line_index)
    units, spans = extract_braced_units(text, language, line_index)
    spans.extend(extern_spans)
    declarations = extract_function_declarations(text, spans, line_index)
    type_units = [u for u in units if u.kind in {"struct", "union", "enum", "enum_class", "class"}]
    functions = [u for u in units if u.kind == "function"]
    globals_ = extract_globals(text, spans, line_index)
    loose_blocks = extract_loose_blocks(text, spans, line_index)
    return ParseResult(
        language=language,
        syntax_ok=syntax_ok,
        syntax_command=syntax_command,
        syntax_output=syntax_output,
        includes=includes,
        imports=imports,
        pragmas=pragmas,
        macros=macros,
        preprocessor_blocks=preprocessor_blocks,
        extern_blocks=extern_blocks,
        asm_blocks=asm_blocks,
        forward_declarations=forward_declarations,
        declarations=declarations,
        type_units=type_units,
        global_units=globals_,
        functions=functions,
        loose_blocks=loose_blocks,
    )


def select_relevant(units: Iterable[Unit], target: Unit) -> list[Unit]:
    selected = []
    target_symbols = target.identifiers | target.calls
    for unit in units:
        if unit.name in target_symbols or target_symbols.intersection(unit.identifiers):
            selected.append(unit)
    return selected


def expand_transitive(units: list[Unit], selected: list[Unit]) -> list[Unit]:
    selected_by_name = {unit.name: unit for unit in selected}
    changed = True
    passes = 0
    while changed and passes < MAX_DEPENDENCY_PASSES:
        passes += 1
        changed = False
        symbols = set()
        for unit in selected_by_name.values():
            symbols.update(unit.identifiers)
            symbols.update(unit.calls)
        for unit in units:
            if unit.name not in selected_by_name and (
                unit.name in symbols or symbols.intersection(unit.identifiers)
            ):
                selected_by_name[unit.name] = unit
                changed = True
    order = {id(unit): idx for idx, unit in enumerate(units)}
    return sorted(selected_by_name.values(), key=lambda unit: order.get(id(unit), 999999))


def make_chunk(parse: ParseResult, target: Unit) -> str:
    relevant_globals = expand_transitive(parse.global_units, select_relevant(parse.global_units, target))
    type_seed = Unit(
        kind="seed",
        name=target.name,
        code="",
        start_line=target.start_line,
        end_line=target.end_line,
        identifiers=set(target.identifiers),
        calls=set(target.calls),
    )
    for unit in relevant_globals:
        type_seed.identifiers.update(unit.identifiers)
        type_seed.identifiers.add(unit.name)
    relevant_types = expand_transitive(parse.type_units, select_relevant(parse.type_units, type_seed))
    relevant_forwards = select_relevant(parse.forward_declarations, type_seed)
    called_prototypes = [
        f"/* local call available: {fn.name} lines {fn.start_line}-{fn.end_line} */"
        for fn in parse.functions
        if fn.name in target.calls and fn.name != target.name
    ]
    parts = [
        f"/* LANGUAGE: {parse.language} */",
        f"/* TARGET: {target.kind} {target.name} lines {target.start_line}-{target.end_line} */",
    ]
    if parse.includes:
        parts += ["\n/* INCLUDES */", *parse.includes]
    if parse.imports:
        parts += ["\n/* MODULE IMPORTS */", *parse.imports]
    if parse.pragmas:
        parts += ["\n/* PRAGMAS */", *parse.pragmas]
    if parse.preprocessor_blocks:
        parts += ["\n/* PREPROCESSOR CONDITIONALS PRESENT */", *parse.preprocessor_blocks[:20]]
    context_symbols = set(target.identifiers) | set(target.calls)
    for unit in [*relevant_types, *relevant_globals]:
        context_symbols.update(unit.identifiers)
        context_symbols.update(unit.calls)
        context_symbols.add(unit.name)
    macro_hits = [m for m in parse.macros if any(tok in m for tok in context_symbols)]
    if macro_hits:
        parts += ["\n/* RELEVANT MACROS */", *macro_hits]
    if relevant_types:
        parts.append("\n/* RELEVANT TYPES */")
        parts.extend(u.code for u in relevant_types)
    if relevant_forwards:
        parts.append("\n/* RELEVANT FORWARD DECLARATIONS */")
        parts.extend(u.code for u in relevant_forwards)
    relevant_decls = select_relevant(parse.declarations, target)
    if relevant_decls:
        parts.append("\n/* RELEVANT DECLARATIONS */")
        parts.extend(u.code for u in relevant_decls)
    if parse.extern_blocks:
        ext_hits = select_relevant(parse.extern_blocks, target)
        if ext_hits:
            parts.append("\n/* RELEVANT EXTERN LINKAGE BLOCKS */")
            parts.extend(u.code for u in ext_hits)
    if parse.asm_blocks:
        asm_hits = select_relevant(parse.asm_blocks, target)
        if asm_hits:
            parts.append("\n/* RELEVANT ASM DECLARATIONS */")
            parts.extend(u.code for u in asm_hits)
    if relevant_globals:
        parts.append("\n/* RELEVANT GLOBALS */")
        parts.extend(u.code for u in relevant_globals)
    if called_prototypes:
        parts += ["\n/* LOCAL CALL CONTEXT */", *called_prototypes]
    parts += ["\n/* TARGET CODE */", target.code]
    return "\n".join(parts).strip() + "\n"


def run() -> None:
    source_path = ROOT / TARGET_FILE
    if not source_path.exists():
        raise FileNotFoundError(f"TARGET_FILE not found: {source_path}")

    start = time.perf_counter()
    parse = parse_source(source_path)
    chunks: list[tuple[Unit, str]] = []

    if parse.syntax_ok:
        targets = parse.functions if parse.functions else parse.loose_blocks
        if not targets and parse.type_units:
            targets = parse.type_units
        for target in targets:
            chunks.append((target, make_chunk(parse, target)))

    elapsed_ms = (time.perf_counter() - start) * 1000

    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        f.write(f"TARGET_FILE: {TARGET_FILE}\n")
        f.write(f"LANGUAGE: {parse.language}\n")
        f.write(f"SYNTAX_OK: {parse.syntax_ok}\n\n")
        if not parse.syntax_ok:
            f.write("SYNTAX ERROR: chunks were not generated.\n")
            f.write(parse.syntax_output + "\n")
        else:
            for idx, (unit, chunk) in enumerate(chunks, 1):
                f.write("=" * 90 + "\n")
                f.write(f"CHUNK {idx}: {unit.kind} {unit.name} lines {unit.start_line}-{unit.end_line}\n")
                f.write("=" * 90 + "\n")
                f.write(chunk + "\n")

    report = {
        "target_file": TARGET_FILE,
        "language": parse.language,
        "syntax_ok": parse.syntax_ok,
        "syntax_command": parse.syntax_command,
        "syntax_output": parse.syntax_output,
        "elapsed_ms": round(elapsed_ms, 3),
        "includes": len(parse.includes),
        "imports": len(parse.imports),
        "pragmas": len(parse.pragmas),
        "macros": len(parse.macros),
        "preprocessor_conditionals": len(parse.preprocessor_blocks),
        "extern_blocks": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.extern_blocks],
        "asm_blocks": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.asm_blocks],
        "forward_declarations": [
            {"kind": u.kind, "name": u.name, "lines": [u.start_line, u.end_line]}
            for u in parse.forward_declarations
        ],
        "declarations": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.declarations],
        "types": [{"kind": u.kind, "name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.type_units],
        "globals": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.global_units],
        "functions": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.functions],
        "loose_blocks": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.loose_blocks],
        "chunks_created": len(chunks),
    }
    REPORT_FILE.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Done in {elapsed_ms:.2f} ms")
    print(f"Syntax OK: {parse.syntax_ok}")
    print(f"Chunks created: {len(chunks)}")
    print(f"Chunk output: {OUTPUT_FILE}")
    print(f"Report: {REPORT_FILE}")


def generate_semantic_chunks(source_path: Path) -> dict:
    """Return model-ready chunks and parser metadata for one C/C++ file."""
    start = time.perf_counter()
    parse = parse_source(source_path)
    chunks: list[dict] = []

    if parse.syntax_ok:
        targets = parse.functions if parse.functions else parse.loose_blocks
        if not targets and parse.type_units:
            targets = parse.type_units
        for index, target in enumerate(targets, 1):
            chunks.append(
                {
                    "index": index,
                    "kind": target.kind,
                    "name": target.name,
                    "start_line": target.start_line,
                    "end_line": target.end_line,
                    "content": make_chunk(parse, target),
                }
            )

    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "language": parse.language,
        "syntax_ok": parse.syntax_ok,
        "syntax_command": parse.syntax_command,
        "syntax_output": parse.syntax_output,
        "elapsed_ms": round(elapsed_ms, 3),
        "chunks_created": len(chunks),
        "chunks": chunks,
        "functions": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.functions],
        "types": [{"kind": u.kind, "name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.type_units],
        "globals": [{"name": u.name, "lines": [u.start_line, u.end_line]} for u in parse.global_units],
    }


if __name__ == "__main__":
    run()
