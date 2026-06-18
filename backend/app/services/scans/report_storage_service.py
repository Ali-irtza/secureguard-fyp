import io
import csv
import html
import os
import re
import zipfile
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from supabase import Client
import httpcore
import httpx


REPORT_BUCKET = "scan-reports"
REPORT_TTL_DAYS = 5

RETRYABLE_SUPABASE_EXCEPTIONS = (
    httpx.RemoteProtocolError,
    httpcore.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.TimeoutException,
)


def _retry_supabase_request(operation_name: str, action):
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            return action()
        except RETRYABLE_SUPABASE_EXCEPTIONS as exc:
            last_exc = exc
            if attempt == 2:
                print(f"[reports] {operation_name} failed after retries: {exc}")
                raise
            delay = 0.35 * (2 ** attempt) + random.uniform(0.0, 0.15)
            print(f"[reports] {operation_name} retry {attempt + 1}/3 after {exc.__class__.__name__}")
            time.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError(f"{operation_name} failed without raising an exception")

FONT_BODY = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_MONO = "Courier"


def _register_code_font() -> str:
    candidates: list[tuple[str, Path]] = [
        ("PseudoFontLigaMono", Path("assets/fonts/PseudoFontLigaMono-Regular.ttf")),
        ("PseudoFontLigaMono", Path("assets/fonts/PseudoFont-Liga-Mono-Regular.ttf")),
        ("PseudoFontLigaMono", Path("backend/assets/fonts/PseudoFontLigaMono-Regular.ttf")),
        ("PseudoFontLigaMono", Path("backend/assets/fonts/PseudoFont-Liga-Mono-Regular.ttf")),
        ("PseudoFontLigaMono", Path("frontend/src/assets/fonts/PseudoFontLigaMono-Regular.ttf")),
        ("PseudoFontLigaMono", Path("frontend/src/assets/fonts/PseudoFont-Liga-Mono-Regular.ttf")),
        ("CascadiaMono", Path("C:/Windows/Fonts/CascadiaMono.ttf")),
        ("CascadiaMono", Path("C:/Windows/Fonts/CascadiaCode.ttf")),
        ("Consolas", Path("C:/Windows/Fonts/consola.ttf")),
    ]
    for font_name, path in candidates:
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(font_name, str(path)))
                return font_name
            except Exception:
                continue
    return FONT_MONO


FONT_CODE = _register_code_font()

COLOR_BG_DARK = HexColor("#0d1117")
COLOR_BG_CARD = HexColor("#f8fafc")
COLOR_PANEL = HexColor("#f1f5f9")
COLOR_PANEL_DARK = HexColor("#111827")
COLOR_ACCENT = HexColor("#ef4444")
COLOR_ACCENT_BLUE = HexColor("#2563eb")
COLOR_ACCENT_PURPLE = HexColor("#7c3aed")
COLOR_SUCCESS = HexColor("#22c55e")
COLOR_BORDER = HexColor("#e5e7eb")
COLOR_MUTED = HexColor("#6b7280")
COLOR_DARK = HexColor("#111827")
COLOR_CWE_BG = HexColor("#eff6ff")
COLOR_CWE_TEXT = HexColor("#1e40af")
COLOR_CRIT_BG = HexColor("#fef2f2")
COLOR_CRIT_TEXT = HexColor("#dc2626")
COLOR_HIGH_BG = HexColor("#fff7ed")
COLOR_HIGH_TEXT = HexColor("#c2410c")
COLOR_MED_BG = HexColor("#fefce8")
COLOR_MED_TEXT = HexColor("#a16207")
COLOR_LOW_BG = HexColor("#f0fdf4")
COLOR_LOW_TEXT = HexColor("#166534")
COLOR_FIX_BG = HexColor("#f0fdf4")
COLOR_FIX_TEXT = HexColor("#166534")
COLOR_CODE_DARK = HexColor("#0d1117")
COLOR_CODE_LINE = HexColor("#161b22")
COLOR_CODE_TEXT = HexColor("#e6edf3")
COLOR_CODE_NUM = HexColor("#8b949e")
COLOR_CODE_BORDER = HexColor("#30363d")


def _escape(text: object) -> str:
    return html.escape(str(text or ""), quote=False).replace("\n", "<br/>")


def _report_lines(scan_data: Dict, vulnerabilities: List[Dict]) -> list[str]:
    lines = [
        f"Project: {scan_data.get('project_name') or 'Project'}",
        f"Scan ID: {scan_data.get('id') or scan_data.get('scan_id') or ''}",
        f"Scan Type: {scan_data.get('scan_type') or 'Unknown'}",
        f"Files Scanned: {scan_data.get('files_scanned') or scan_data.get('files_analyzed') or 0}",
        f"Risk: {scan_data.get('overall_risk_level') or scan_data.get('risk_level') or 'Unknown'}",
        f"Risk Score: {scan_data.get('overall_risk_score') or scan_data.get('risk_score') or 0}",
        f"Vulnerabilities: {scan_data.get('total_vulnerabilities') or scan_data.get('total_vulns') or len(vulnerabilities)}",
        "",
    ]
    for index, vuln in enumerate(vulnerabilities, start=1):
        lines.extend(
            [
                f"Issue {index}: {vuln.get('cwe_id', '')} {vuln.get('cwe_name', '')} [{vuln.get('severity', '')}]",
                f"Line: {vuln.get('file_path', '')}, line {vuln.get('line_number', 0)}",
                f"Code: {vuln.get('affected_code') or vuln.get('code_snippet') or 'No exact source line returned.'}",
                f"Problem: {vuln.get('description', '')}",
                f"Recommended fix: {vuln.get('fix_suggestion', '')}",
                "",
            ]
        )
    return lines


def _severity_colors(severity: str) -> tuple:
    value = str(severity or "").lower()
    if value == "critical":
        return COLOR_CRIT_BG, COLOR_CRIT_TEXT, COLOR_ACCENT
    if value == "high":
        return COLOR_HIGH_BG, COLOR_HIGH_TEXT, COLOR_HIGH_TEXT
    if value == "medium":
        return COLOR_MED_BG, COLOR_MED_TEXT, COLOR_MED_TEXT
    return COLOR_LOW_BG, COLOR_LOW_TEXT, COLOR_SUCCESS


def _build_code_table(code: str, start_line: int, styles: dict, dark: bool = False) -> Table:
    rows = []
    source_lines = str(code or "No exact source line returned.").splitlines() or [str(code or "")]
    for offset, line in enumerate(source_lines[:220]):
        number = start_line + offset if start_line else offset + 1
        rows.append(
            [
                Paragraph(str(number), styles["code_num_dark" if dark else "code_num"]),
                Paragraph(_escape(line[:160]), styles["code_dark" if dark else "code"]),
            ]
        )
    table = Table(rows, colWidths=[34, 442], repeatRows=0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
    ]
    if dark:
        for idx in range(len(rows)):
            bg = COLOR_CODE_DARK if idx % 2 == 0 else COLOR_CODE_LINE
            commands.extend([("BACKGROUND", (0, idx), (-1, idx), bg)])
        commands.extend([
            ("BOX", (0, 0), (-1, -1), 0.8, COLOR_CODE_BORDER),
            ("LINEAFTER", (0, 0), (0, -1), 0.5, COLOR_CODE_BORDER),
        ])
    else:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f6f8fa")),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#edf2f7")),
        ])
    table.setStyle(TableStyle(commands))
    return table


def _chunk_line(chunk: Dict, line_number: int) -> str:
    if line_number <= 0:
        return ""
    start_line = int(chunk.get("start_line") or 1)
    end_line = int(chunk.get("end_line") or 0)
    if line_number < start_line or (end_line and line_number > end_line):
        return ""
    lines = str(chunk.get("code") or "").splitlines()
    return lines[line_number - start_line] if 0 <= line_number - start_line < len(lines) else ""


def _nearest_non_empty_line(lines: list[str], preferred_index: int = 0) -> str:
    if not lines:
        return ""
    preferred_index = max(0, min(preferred_index, len(lines) - 1))
    if lines[preferred_index].strip():
        return lines[preferred_index]
    for distance in range(1, len(lines)):
        before = preferred_index - distance
        after = preferred_index + distance
        if before >= 0 and lines[before].strip():
            return lines[before]
        if after < len(lines) and lines[after].strip():
            return lines[after]
    return lines[preferred_index]


def _nearest_chunk_line(chunk: Dict, line_number: int) -> str:
    lines = str(chunk.get("code") or "").splitlines()
    if not lines:
        return ""
    start_line = int(chunk.get("start_line") or 1)
    preferred_index = line_number - start_line if line_number > 0 else 0
    return _nearest_non_empty_line(lines, preferred_index)


def _split_source_lines(source: str) -> list[str]:
    lines = str(source or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if len(lines) > 1 and lines[-1] == "":
        lines.pop()
    return lines


def _path_matches(candidate: str, target: str) -> bool:
    candidate_norm = _safe_zip_path(candidate).lower()
    target_norm = _safe_zip_path(target).lower()
    if not candidate_norm or not target_norm:
        return False
    return (
        candidate_norm == target_norm
        or candidate_norm.endswith(f"/{target_norm}")
        or target_norm.endswith(f"/{candidate_norm}")
        or os.path.basename(candidate_norm) == os.path.basename(target_norm)
    )


def _source_line_for_issue(issue: Dict, source_files: List[Dict]) -> str:
    line_number = int(issue.get("absolute_line") or issue.get("line_number") or 0)
    issue_path = str(issue.get("file_path") or "").strip()
    candidates: list[Dict] = []
    for source in source_files:
        source_name = str(source.get("filename") or "").strip()
        if issue_path and source_name and _path_matches(source_name, issue_path):
            candidates.append(source)

    if not candidates and len(source_files) == 1:
        candidates = source_files

    for source in candidates:
        lines = _split_source_lines(str(source.get("source_code") or ""))
        if 0 <= line_number - 1 < len(lines):
            return _nearest_non_empty_line(lines, line_number - 1)
    for source in candidates:
        nearest = _nearest_non_empty_line(_split_source_lines(str(source.get("source_code") or "")), max(line_number - 1, 0))
        if nearest.strip():
            return nearest
    return ""


def _looks_like_line_marker(value: str) -> bool:
    normalized = value.strip()
    return bool(re.fullmatch(r"(?:line\s*)?\d+|line\s+\d+\s*:?", normalized, re.IGNORECASE))


def _looks_like_non_code_value(value: str) -> bool:
    normalized = " ".join(value.strip().lower().split())
    return normalized in {
        "",
        "null",
        "none",
        "n/a",
        "critical",
        "high",
        "medium",
        "low",
    } or _looks_like_line_marker(value)


def _affected_code_for_issue(issue: Dict, chunks: List[Dict], source_files: List[Dict] | None = None) -> str:
    direct = str(issue.get("affected_code") or issue.get("code_snippet") or "").strip()
    file_path = issue.get("file_path") or ""
    line_number = int(issue.get("absolute_line") or issue.get("line_number") or 0)
    source_line = _source_line_for_issue(issue, source_files or [])
    if source_line.strip():
        return source_line
    for chunk in chunks:
        chunk_path = str(chunk.get("file_path") or "")
        if file_path and chunk_path and _path_matches(chunk_path, file_path):
            source_line = _chunk_line(chunk, line_number)
            if source_line.strip():
                return source_line
    fallback_chunks = chunks if len({str(chunk.get("file_path") or "") for chunk in chunks}) <= 1 else []
    for chunk in fallback_chunks:
        source_line = _chunk_line(chunk, line_number)
        if source_line.strip():
            return source_line
    for chunk in chunks:
        chunk_path = str(chunk.get("file_path") or "")
        if file_path and chunk_path and _path_matches(chunk_path, file_path):
            source_line = _nearest_chunk_line(chunk, line_number)
            if source_line.strip():
                return source_line
    for chunk in fallback_chunks:
        source_line = _nearest_chunk_line(chunk, line_number)
        if source_line.strip():
            return source_line
    if direct and not _looks_like_non_code_value(direct):
        return direct
    for source in source_files or []:
        source_line = _nearest_non_empty_line(_split_source_lines(str(source.get("source_code") or "")))
        if source_line.strip():
            return source_line
    return ""


def _chunk_issues(chunk: Dict, vulnerabilities: List[Dict]) -> list[Dict]:
    file_path = chunk.get("file_path") or ""
    start_line = int(chunk.get("start_line") or 1)
    end_line = int(chunk.get("end_line") or 0)
    matched: list[Dict] = []
    for issue in vulnerabilities:
        issue_file = issue.get("file_path") or ""
        line_number = int(issue.get("absolute_line") or issue.get("line_number") or 0)
        same_file = not file_path or not issue_file or issue_file == file_path
        in_range = line_number <= 0 or line_number >= start_line and (not end_line or line_number <= end_line)
        if same_file and in_range:
            matched.append(issue)
    return matched


def _metric_card(label: str, value: object, color: HexColor, styles: dict) -> Table:
    value_style = ParagraphStyle(
        f"metric_{label}",
        parent=styles["metric_value"],
        textColor=color,
    )
    table = Table(
        [[Paragraph(label.upper(), styles["metric_label"])], [Paragraph(_escape(value), value_style)]],
        colWidths=[113],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, HexColor("#dbe3ee")),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def _section_bar(title: str, subtitle: str, color: HexColor, styles: dict) -> Table:
    table = Table(
        [[Paragraph(_escape(title), styles["bar_title"])], [Paragraph(_escape(subtitle), styles["bar_subtitle"])]],
        colWidths=[476],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_PANEL_DARK),
        ("LINEBEFORE", (0, 0), (0, -1), 4, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _issue_card(issue: Dict, chunk: Dict, index: int, styles: dict) -> list:
    severity = str(issue.get("severity") or "Medium").title()
    sev_bg, sev_text, sev_border = _severity_colors(severity)
    cwe = issue.get("cwe_id") or issue.get("cwe_name") or issue.get("type") or "CWE"
    line_number = int(issue.get("absolute_line") or issue.get("line_number") or 0)
    affected_code = _affected_code_for_issue(issue, [chunk])

    badge = Table(
        [[Paragraph(severity.upper(), ParagraphStyle(f"badge_{index}", parent=styles["badge"], textColor=sev_text))]],
        colWidths=[70],
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), sev_bg),
        ("BOX", (0, 0), (-1, -1), 0.6, sev_border),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    title = f"Finding {index}: {cwe}"
    header = Table(
        [[Paragraph(_escape(title), styles["issue"]), badge]],
        colWidths=[386, 90],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    fix_box = Table(
        [[Paragraph(_escape(issue.get("fix_suggestion") or "Apply secure coding remediation for this finding."), styles["fix"])]],
        colWidths=[476],
    )
    fix_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_FIX_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2, COLOR_SUCCESS),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [
        header,
        Spacer(1, 6),
        Paragraph(f"Line {line_number or 'N/A'}", styles["label"]),
        Spacer(1, 3),
        _build_code_table(str(affected_code), line_number or int(chunk.get("start_line") or 1), styles, dark=True),
        Spacer(1, 6),
        Paragraph("What is vulnerable", styles["label"]),
        Spacer(1, 3),
        Paragraph(_escape(issue.get("description") or "Security issue detected."), styles["body"]),
        Spacer(1, 6),
        Paragraph("Recommended fix", styles["label_green"]),
        Spacer(1, 3),
        fix_box,
    ]


class NumberedCanvas:
    def __init__(self, canvas, report_name: str):
        self.canvas = canvas
        self.report_name = report_name
        self.saved_page_states = []

    def __getattr__(self, name):
        return getattr(self.canvas, name)

    def showPage(self):
        self.saved_page_states.append(dict(self.canvas.__dict__))
        self.canvas._startPage()

    def save(self):
        total_pages = len(self.saved_page_states)
        for state in self.saved_page_states:
            self.canvas.__dict__.update(state)
            self._draw_header_footer(total_pages)
            self.canvas.showPage()
        self.canvas.save()

    def _draw_header_footer(self, total_pages: int):
        if self.canvas._pageNumber == 1:
            return
        w, h = A4
        self.canvas.saveState()
        self.canvas.setStrokeColor(COLOR_BORDER)
        self.canvas.setLineWidth(0.5)
        self.canvas.line(50, h - 45, w - 50, h - 45)
        self.canvas.setFont(FONT_BOLD, 8)
        self.canvas.setFillColor(COLOR_ACCENT)
        self.canvas.drawString(50, h - 38, "SecureGuard")
        self.canvas.setFont(FONT_BODY, 8)
        self.canvas.setFillColor(COLOR_MUTED)
        self.canvas.drawRightString(w - 50, h - 38, self.report_name[:80])
        self.canvas.line(50, 45, w - 50, 45)
        self.canvas.drawString(50, 32, "CONFIDENTIAL - For authorized use only")
        self.canvas.drawRightString(w - 50, 32, f"Page {self.canvas._pageNumber} of {total_pages}")
        self.canvas.restoreState()


def _draw_cover(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(COLOR_BG_DARK)
    canvas.rect(0, h - 64, w, 64, fill=True, stroke=False)
    canvas.setFillColor(COLOR_ACCENT)
    canvas.rect(0, h - 66, w, 2, fill=True, stroke=False)
    canvas.setFont(FONT_BOLD, 20)
    canvas.setFillColor(colors.white)
    canvas.drawString(50, h - 40, "SecureGuard")
    canvas.setFont(FONT_BODY, 10)
    canvas.setFillColor(HexColor("#9ca3af"))
    canvas.drawRightString(w - 50, h - 38, "Security Scan Report")

    canvas.setFont(FONT_BOLD, 28)
    canvas.setFillColor(COLOR_DARK)
    canvas.drawCentredString(w / 2, h * 0.62, doc.report_name[:70])
    canvas.setFont(FONT_BODY, 11)
    canvas.setFillColor(COLOR_MUTED)
    canvas.drawCentredString(w / 2, h * 0.62 - 22, f"Generated {datetime.now().strftime('%b %d, %Y %I:%M %p')}")

    stats = getattr(doc, "cover_stats", [])
    x = (w - 420) / 2
    y = h * 0.42
    cell_w = 132
    for idx, stat in enumerate(stats):
        sx = x + idx * 144
        is_risk = stat["label"] == "RISK"
        canvas.setFillColor(COLOR_CRIT_BG if is_risk else colors.white)
        canvas.setStrokeColor(COLOR_BORDER)
        canvas.roundRect(sx, y, cell_w, 58, 7, fill=True, stroke=True)
        canvas.setFont(FONT_BOLD, 8)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawCentredString(sx + cell_w / 2, y + 36, stat["label"])
        canvas.setFont(FONT_BOLD, 14)
        canvas.setFillColor(COLOR_CRIT_TEXT if is_risk else COLOR_DARK)
        canvas.drawCentredString(sx + cell_w / 2, y + 16, str(stat["value"])[:18])

    canvas.setFont(FONT_BODY, 9)
    canvas.setFillColor(COLOR_MUTED)
    canvas.drawCentredString(w / 2, 70, "This report contains security-sensitive source code and vulnerability findings.")
    canvas.restoreState()


def _build_simple_pdf(title: str, scan_data: Dict, vulnerabilities: List[Dict]) -> bytes:
    buffer = io.BytesIO()
    report_name = title.replace("SecureGuard Scan Report - ", "")
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=50,
        rightMargin=50,
        topMargin=60,
        bottomMargin=60,
    )
    doc.report_name = report_name
    doc.cover_stats = [
        {"label": "ISSUES", "value": scan_data.get("total_vulnerabilities") or scan_data.get("total_vulns") or len(vulnerabilities)},
        {"label": "FILES", "value": scan_data.get("files_scanned") or scan_data.get("files_analyzed") or 0},
        {"label": "RISK", "value": scan_data.get("overall_risk_level") or scan_data.get("risk_level") or "Unknown"},
    ]

    styles = {
        "section": ParagraphStyle("section", fontName=FONT_BOLD, fontSize=17, leading=21, textColor=COLOR_DARK, spaceAfter=8),
        "issue": ParagraphStyle("issue", fontName=FONT_BOLD, fontSize=12, leading=15, textColor=COLOR_DARK),
        "body": ParagraphStyle("body", fontName=FONT_BODY, fontSize=9.8, leading=13.5, textColor=COLOR_DARK),
        "label": ParagraphStyle("label", fontName=FONT_BOLD, fontSize=8.2, leading=10.5, textColor=COLOR_MUTED),
        "label_green": ParagraphStyle("label_green", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=COLOR_SUCCESS),
        "meta": ParagraphStyle("meta", fontName=FONT_MONO, fontSize=9, leading=11, textColor=COLOR_MUTED, alignment=TA_RIGHT),
        "chip": ParagraphStyle("chip", fontName=FONT_BOLD, fontSize=9, leading=11, textColor=COLOR_CWE_TEXT),
        "badge": ParagraphStyle("badge", fontName=FONT_BOLD, fontSize=8, leading=10, alignment=TA_CENTER),
        "code": ParagraphStyle("code", fontName=FONT_CODE, fontSize=8.5, leading=10.5, textColor=COLOR_DARK),
        "code_num": ParagraphStyle("code_num", fontName=FONT_CODE, fontSize=8, leading=10.5, textColor=COLOR_MUTED, alignment=TA_RIGHT),
        "code_dark": ParagraphStyle("code_dark", fontName=FONT_CODE, fontSize=8.0, leading=9.6, textColor=COLOR_CODE_TEXT),
        "code_num_dark": ParagraphStyle("code_num_dark", fontName=FONT_CODE, fontSize=7.7, leading=9.6, textColor=COLOR_CODE_NUM, alignment=TA_RIGHT),
        "fix": ParagraphStyle("fix", fontName=FONT_BODY, fontSize=9.8, leading=13.5, textColor=COLOR_FIX_TEXT),
        "subtle": ParagraphStyle("subtle", fontName=FONT_BODY, fontSize=9, leading=12, textColor=COLOR_MUTED),
        "metric_label": ParagraphStyle("metric_label", fontName=FONT_BOLD, fontSize=7.6, leading=9.5, textColor=COLOR_MUTED),
        "metric_value": ParagraphStyle("metric_value", fontName=FONT_BOLD, fontSize=13, leading=16, textColor=COLOR_DARK),
        "bar_title": ParagraphStyle("bar_title", fontName=FONT_BOLD, fontSize=13.5, leading=16.5, textColor=colors.white),
        "bar_subtitle": ParagraphStyle("bar_subtitle", fontName=FONT_BODY, fontSize=8.8, leading=11.5, textColor=HexColor("#cbd5e1")),
    }

    story = [Spacer(1, 690), PageBreak()]
    chunk_outputs = scan_data.get("chunk_outputs") or []
    story.append(_section_bar("Scan Overview", "Formal security summary for scanned C/C++ source inputs.", COLOR_ACCENT_BLUE, styles))
    story.append(Spacer(1, 10))
    metrics = Table([[
        _metric_card("Issues", scan_data.get("total_vulnerabilities") or scan_data.get("total_vulns") or len(vulnerabilities), COLOR_ACCENT, styles),
        _metric_card("Files", scan_data.get("files_scanned") or scan_data.get("files_analyzed") or 0, COLOR_ACCENT_BLUE, styles),
        _metric_card("Risk", scan_data.get("overall_risk_level") or scan_data.get("risk_level") or "Unknown", COLOR_ACCENT_PURPLE, styles),
        _metric_card("Score", scan_data.get("overall_risk_score") or scan_data.get("risk_score") or 0, COLOR_SUCCESS, styles),
    ]], colWidths=[119, 119, 119, 119])
    metrics.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.extend([metrics, Spacer(1, 14)])
    summary_rows = [
        ["Project", scan_data.get("project_name") or "Project", "Scan Type", scan_data.get("scan_type") or "Unknown"],
        ["Completed", str(scan_data.get("completed_at") or "N/A")[:19], "Scan ID", scan_data.get("id") or scan_data.get("scan_id") or ""],
    ]
    summary = Table(summary_rows, colWidths=[76, 172, 76, 172])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_PANEL),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#dbe3ee")),
        ("FONTNAME", (0, 0), (0, -1), FONT_BOLD),
        ("FONTNAME", (2, 0), (2, -1), FONT_BOLD),
        ("TEXTCOLOR", (0, 0), (0, -1), COLOR_MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), COLOR_MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([summary, Spacer(1, 18)])

    if not chunk_outputs:
        story.append(Paragraph("No source chunks were included in this report.", styles["body"]))
    for chunk_index, chunk in enumerate(chunk_outputs, start=1):
        filename = chunk.get("file_path") or chunk.get("chunk_name") or "source"
        start_line = int(chunk.get("start_line") or 1)
        end_line = int(chunk.get("end_line") or start_line)
        issues = _chunk_issues(chunk, vulnerabilities)
        story.extend([
            _section_bar(
                f"Input {chunk_index}: {filename}",
                f"Lines {start_line} to {end_line} - {len(issues)} CWE finding{'s' if len(issues) != 1 else ''}",
                COLOR_ACCENT_BLUE,
                styles,
            ),
            Spacer(1, 8),
            Paragraph("Input Code", styles["label"]),
            Spacer(1, 4),
            _build_code_table(str(chunk.get("code") or ""), start_line, styles, dark=True),
            Spacer(1, 10),
            Paragraph("CWE Findings In This Input", styles["label"]),
            Spacer(1, 5),
        ])
        if issues:
            for issue_index, issue in enumerate(issues, start=1):
                story.extend([KeepTogether(_issue_card(issue, chunk, issue_index, styles)), Spacer(1, 10)])
        else:
            no_issue = Table([[Paragraph("No vulnerabilities were reported for this input block.", styles["body"])]], colWidths=[476])
            no_issue.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), HexColor("#ecfdf5")),
                ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#bbf7d0")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.extend([no_issue, Spacer(1, 10)])
        story.extend([
            Paragraph("Corrected Code", styles["label_green"]),
            Spacer(1, 4),
            _build_code_table(str(chunk.get("corrected_code") or "No corrected code was returned."), start_line, styles, dark=True),
            Spacer(1, 16),
        ])
        if chunk_index < len(chunk_outputs):
            story.append(PageBreak())

    def canvas_factory(*args, **kwargs):
        from reportlab.pdfgen import canvas as canvas_module
        return NumberedCanvas(canvas_module.Canvas(*args, **kwargs), report_name)

    doc.build(story, onFirstPage=_draw_cover, canvasmaker=canvas_factory)
    return buffer.getvalue()


def build_pdf_report(scan_data: Dict, vulnerabilities: List[Dict]) -> bytes:
    scan_id = scan_data.get("id") or scan_data.get("scan_id") or "scan"
    title = f"SecureGuard Scan Report - {scan_data.get('project_name') or scan_id}"
    return _build_simple_pdf(title, scan_data, vulnerabilities)


def _build_csv(scan_data: Dict, vulnerabilities: List[Dict], source_files: List[Dict] | None = None) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Line Number", "CWE ID", "Code Line", "Explanation"])
    for vuln in vulnerabilities:
        writer.writerow([
            vuln.get("line_number") or vuln.get("absolute_line") or "",
            vuln.get("cwe_id") or "",
            _affected_code_for_issue(vuln, scan_data.get("chunk_outputs") or [], source_files or []),
            vuln.get("description") or "",
        ])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def build_vulnerability_csv(scan_data: Dict, vulnerabilities: List[Dict], source_files: List[Dict] | None = None) -> bytes:
    return _build_csv(scan_data, vulnerabilities, source_files)


def load_source_files_from_report_artifact(supabase: Client, storage_path: str | None) -> list[dict]:
    if not storage_path:
        return []
    try:
        zipped = supabase.storage.from_(REPORT_BUCKET).download(storage_path)
        source_files: list[dict] = []
        with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
            for name in archive.namelist():
                if not name.startswith("code/input/") or name.endswith("/"):
                    continue
                source_files.append(
                    {
                        "filename": name.removeprefix("code/input/"),
                        "source_code": archive.read(name).decode("utf-8", errors="replace"),
                        "storage_path": storage_path,
                    }
                )
        return source_files
    except Exception as exc:
        print(f"[reports] Failed to load source files from report artifact: {exc}")
        return []


def _upload_zip(supabase: Client, path: str, files: dict[str, bytes]) -> None:
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)

    supabase.storage.from_(REPORT_BUCKET).upload(
        path,
        zip_buffer.getvalue(),
        file_options={
            "content-type": "application/zip",
            "upsert": "true",
            "x-upsert": "true",
        },
    )


def _safe_zip_path(path: str) -> str:
    normalized = (path or "source.c").replace("\\", "/").strip().lstrip("/")
    parts = [part for part in normalized.split("/") if part and part not in {".", ".."}]
    return "/".join(parts) or "source.c"


def _corrected_name_for(path: str) -> str:
    safe_path = _safe_zip_path(path)
    directory = os.path.dirname(safe_path).replace("\\", "/")
    basename = os.path.basename(safe_path)
    stem, ext = os.path.splitext(basename)
    corrected = f"{stem or 'source'}_corrected{ext or '.txt'}"
    return f"{directory}/{corrected}" if directory else corrected


def _normalized_chunk_outputs(scan_data: Dict) -> list[dict]:
    chunks = scan_data.get("chunk_outputs") or []
    if chunks:
        return chunks

    normalized: list[dict] = []
    for file_item in scan_data.get("files") or []:
        file_path = file_item.get("filename") or file_item.get("file_path") or scan_data.get("file_name") or "source.c"
        for chunk in file_item.get("chunk_outputs") or []:
            normalized.append({**chunk, "file_path": chunk.get("file_path") or file_path})
    return normalized


def _code_entries_from_chunks(scan_data: Dict) -> dict[str, bytes]:
    grouped: dict[str, list[dict]] = {}
    for chunk in _normalized_chunk_outputs(scan_data):
        file_path = chunk.get("file_path") or chunk.get("chunk_name") or "source.c"
        grouped.setdefault(file_path, []).append(chunk)

    files: dict[str, bytes] = {}
    for file_path, chunks in grouped.items():
        safe_path = _safe_zip_path(file_path)
        sorted_chunks = sorted(chunks, key=lambda chunk: int(chunk.get("chunk_index") or 0))
        input_code = "\n\n".join(str(chunk.get("code") or "") for chunk in sorted_chunks if chunk.get("code")).strip()
        corrected_code = "\n\n".join(
            str(chunk.get("corrected_code") or "")
            for chunk in sorted_chunks
            if chunk.get("corrected_code") and chunk.get("corrected_code") not in {"None", "Pending..."}
        ).strip()
        if input_code:
            files[f"code/input/{safe_path}"] = input_code.encode("utf-8")
        if corrected_code:
            files[f"code/corrected/{_corrected_name_for(safe_path)}"] = corrected_code.encode("utf-8")
    return files


def create_zipped_pdf_report(
    supabase: Client,
    user_id: str,
    scan_id: str,
    scan_data: Dict,
    vulnerabilities: List[Dict],
) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)
    title = f"SecureGuard Scan Report - {scan_data.get('project_name') or scan_id}"
    pdf_bytes = _build_simple_pdf(title, scan_data, vulnerabilities)

    path = f"{user_id}/{scan_id}/report.zip"
    _upload_zip(supabase, path, {"report.pdf": pdf_bytes, **_code_entries_from_chunks(scan_data)})
    return {"path": path, "expires_at": expires_at.isoformat()}


def create_zipped_report(
    supabase: Client,
    user_id: str,
    scan_id: str,
    scan_data: Dict,
    vulnerabilities: List[Dict],
    report_format: str,
) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)
    safe_format = "csv" if report_format == "csv" else "pdf"
    title = f"SecureGuard Scan Report - {scan_data.get('project_name') or scan_id}"
    if safe_format == "csv":
        filename = "report.csv"
        content = _build_csv(scan_data, vulnerabilities)
    else:
        filename = "report.pdf"
        content = _build_simple_pdf(title, scan_data, vulnerabilities)

    path = f"{user_id}/{scan_id}/{safe_format}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}.zip"
    _upload_zip(supabase, path, {filename: content, **_code_entries_from_chunks(scan_data)})
    return {"path": path, "expires_at": expires_at.isoformat(), "filename": filename, "format": safe_format}


def cleanup_expired_reports(supabase: Client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    result = _retry_supabase_request(
        "cleanup_expired_reports.select_expired",
        lambda: (
            supabase.table("reports")
            .select("id,file_path")
            .lt("expires_at", now)
            .execute()
        ),
    )
    paths = [row["file_path"] for row in result.data or [] if row.get("file_path")]
    if paths:
        supabase.storage.from_(REPORT_BUCKET).remove(paths)
        for row in result.data:
            _retry_supabase_request(
                "cleanup_expired_reports.update_failed",
                lambda row_id=row["id"]: supabase.table("reports").update({"file_path": None, "status": "failed"}).eq("id", row_id).execute(),
            )


def load_pdf_from_zip(supabase: Client, storage_path: str) -> bytes:
    zipped = supabase.storage.from_(REPORT_BUCKET).download(storage_path)
    with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
        return archive.read("report.pdf")


def load_report_from_zip(supabase: Client, storage_path: str, report_format: str) -> tuple[bytes, str, str]:
    filename = "report.csv" if report_format == "csv" else "report.pdf"
    media_type = "text/csv; charset=utf-8" if report_format == "csv" else "application/pdf"
    zipped = supabase.storage.from_(REPORT_BUCKET).download(storage_path)
    with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
        if filename not in archive.namelist():
            filename = archive.namelist()[0]
        return archive.read(filename), filename, media_type
