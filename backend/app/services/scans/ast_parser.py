"""
ast_parser.py

Parses C/C++ source code and splits it into individual functions using regex.
Each extracted piece is represented as a CodeChunk.
"""

import re
from dataclasses import dataclass
from typing import List


@dataclass
class CodeChunk:
    name: str       # Function name, or "global" / "full_file"
    code: str       # The actual source code of this chunk
    start_line: int # Line number where this chunk starts (1-indexed)
    end_line: int   # Line number where this chunk ends (1-indexed)


# Matches C/C++ function signatures at the start of a line.
# Captures the function name in group 1.
_FUNC_PATTERN = re.compile(
    r'^[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*\{',
    re.MULTILINE
)


def _find_closing_brace(source: str, open_pos: int) -> int:
    """
    Given the position of an opening '{' in source, walk forward counting
    braces and return the index of the matching closing '}'.
    Returns -1 if no matching brace is found.
    """
    depth = 0
    for i in range(open_pos, len(source)):
        if source[i] == '{':
            depth += 1
        elif source[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    return -1


def _line_of(source: str, pos: int) -> int:
    """Return the 1-indexed line number for a character position in source."""
    return source[:pos].count('\n') + 1


def extract_chunks(source_code: str) -> List[CodeChunk]:
    """
    Parse C/C++ source code and return a list of CodeChunk objects, one per
    top-level function found.

    - Uses regex to locate function signatures.
    - Tracks brace depth to find each function's closing '}'.
    - Calculates start_line / end_line from newline counts.
    - Skips chunks whose code contains fewer than 2 newlines (too small).
    - Falls back to a single "full_file" chunk when no functions are detected.
    """
    chunks: List[CodeChunk] = []

    for match in _FUNC_PATTERN.finditer(source_code):
        func_name = match.group(1)

        # The '{' that opens the function body is the last char of the match.
        open_brace_pos = match.end() - 1

        close_brace_pos = _find_closing_brace(source_code, open_brace_pos)
        if close_brace_pos == -1:
            # Unmatched brace — skip this match
            continue

        # Slice out the full function text (signature + body)
        chunk_code = source_code[match.start(): close_brace_pos + 1]

        # Skip trivially small chunks
        if chunk_code.count('\n') < 2:
            continue

        start_line = _line_of(source_code, match.start())
        end_line = _line_of(source_code, close_brace_pos)

        chunks.append(CodeChunk(
            name=func_name,
            code=chunk_code,
            start_line=start_line,
            end_line=end_line,
        ))

    # If no functions were found, treat the whole file as one chunk
    if not chunks:
        total_lines = source_code.count('\n') + 1
        chunks.append(CodeChunk(
            name="full_file",
            code=source_code,
            start_line=1,
            end_line=total_lines,
        ))

    return chunks
