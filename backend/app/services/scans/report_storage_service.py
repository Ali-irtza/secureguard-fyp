import io
import csv
import html
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
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


REPORT_BUCKET = "scan-reports"
REPORT_TTL_DAYS = 5

FONT_BODY = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_MONO = "Courier"

COLOR_BG_DARK = HexColor("#0d1117")
COLOR_BG_CARD = HexColor("#f9fafb")
COLOR_ACCENT = HexColor("#ef4444")
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
    chunk_outputs = scan_data.get("chunk_outputs") or []
    if chunk_outputs:
        lines.append("Chunks:")
        for chunk in chunk_outputs:
            lines.append(
                f"- Chunk {chunk.get('chunk_index')}: lines {chunk.get('start_line')}-{chunk.get('end_line')} "
                f"with {len(chunk.get('vulnerabilities') or [])} issue(s)"
            )
        lines.append("")

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
    corrected = scan_data.get("corrected_code") or ""
    if corrected and corrected != "None":
        lines.extend(["Corrected Code:", corrected[:4000]])
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
    for offset, line in enumerate(source_lines[:240]):
        number = start_line + offset if start_line else offset + 1
        rows.append(
            [
                Paragraph(str(number), styles["code_num_dark" if dark else "code_num"]),
                Paragraph(_escape(line[:160]), styles["code_dark" if dark else "code"]),
            ]
        )
    table = Table(rows, colWidths=[38, 430], repeatRows=0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (0, 0), (0, -1), "RIGHT"),
    ]
    if dark:
        for idx in range(len(rows)):
            bg = COLOR_CODE_DARK if idx % 2 == 0 else COLOR_CODE_LINE
            commands.extend([("BACKGROUND", (0, idx), (-1, idx), bg)])
    else:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#f6f8fa")),
            ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, HexColor("#edf2f7")),
        ])
    table.setStyle(TableStyle(commands))
    return table


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
        "section": ParagraphStyle("section", fontName=FONT_BOLD, fontSize=16, leading=20, textColor=COLOR_DARK, spaceAfter=8),
        "issue": ParagraphStyle("issue", fontName=FONT_BOLD, fontSize=13, leading=16, textColor=COLOR_DARK),
        "body": ParagraphStyle("body", fontName=FONT_BODY, fontSize=10.5, leading=15, textColor=COLOR_DARK),
        "label": ParagraphStyle("label", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=COLOR_MUTED),
        "label_green": ParagraphStyle("label_green", fontName=FONT_BOLD, fontSize=8.5, leading=11, textColor=COLOR_SUCCESS),
        "meta": ParagraphStyle("meta", fontName=FONT_MONO, fontSize=9, leading=11, textColor=COLOR_MUTED, alignment=TA_RIGHT),
        "chip": ParagraphStyle("chip", fontName=FONT_BOLD, fontSize=9, leading=11, textColor=COLOR_CWE_TEXT),
        "badge": ParagraphStyle("badge", fontName=FONT_BOLD, fontSize=8, leading=10, alignment=TA_CENTER),
        "code": ParagraphStyle("code", fontName=FONT_MONO, fontSize=8.5, leading=10.5, textColor=COLOR_DARK),
        "code_num": ParagraphStyle("code_num", fontName=FONT_MONO, fontSize=8, leading=10.5, textColor=COLOR_MUTED, alignment=TA_RIGHT),
        "code_dark": ParagraphStyle("code_dark", fontName=FONT_MONO, fontSize=8.2, leading=10.2, textColor=COLOR_CODE_TEXT),
        "code_num_dark": ParagraphStyle("code_num_dark", fontName=FONT_MONO, fontSize=8, leading=10.2, textColor=COLOR_CODE_NUM, alignment=TA_RIGHT),
        "fix": ParagraphStyle("fix", fontName=FONT_BODY, fontSize=10.5, leading=14, textColor=COLOR_FIX_TEXT),
        "subtle": ParagraphStyle("subtle", fontName=FONT_BODY, fontSize=9, leading=12, textColor=COLOR_MUTED),
    }

    story = [Spacer(1, 690), PageBreak()]
    story.append(Paragraph("Executive Summary", styles["section"]))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_BORDER))
    story.append(Spacer(1, 10))
    summary_rows = [
        ["Project", scan_data.get("project_name") or "Project", "Scan Type", scan_data.get("scan_type") or "Unknown"],
        ["Risk Score", str(scan_data.get("overall_risk_score") or scan_data.get("risk_score") or 0), "Completed", str(scan_data.get("completed_at") or "N/A")[:19]],
    ]
    summary = Table(summary_rows, colWidths=[82, 166, 82, 166])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG_CARD),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, COLOR_BORDER),
        ("FONTNAME", (0, 0), (0, -1), FONT_BOLD),
        ("FONTNAME", (2, 0), (2, -1), FONT_BOLD),
        ("TEXTCOLOR", (0, 0), (0, -1), COLOR_MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), COLOR_MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([summary, Spacer(1, 18), Paragraph("Vulnerability Findings", styles["section"])])

    if not vulnerabilities:
        story.append(Paragraph("No vulnerabilities were reported for this scan.", styles["body"]))
    for index, issue in enumerate(vulnerabilities, start=1):
        severity = str(issue.get("severity") or "Medium").title()
        sev_bg, sev_text, sev_border = _severity_colors(severity)
        cwe = issue.get("cwe_id") or issue.get("cwe_name") or "CWE"
        line_number = int(issue.get("line_number") or issue.get("absolute_line") or 0)
        filename = issue.get("file_path") or scan_data.get("file_name") or "source"
        affected_code = issue.get("affected_code") or issue.get("code_snippet") or "No exact source line returned."

        badge = Table([[Paragraph(severity.upper(), ParagraphStyle("badge_inner", parent=styles["badge"], textColor=sev_text))]], colWidths=[72])
        badge.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), sev_bg),
            ("BOX", (0, 0), (-1, -1), 0.5, sev_border),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        header = Table([[Paragraph(f"Issue {index}", styles["issue"]), badge]], colWidths=[390, 86])
        header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))

        chip = Table([[Paragraph(_escape(cwe), styles["chip"])]], colWidths=[92])
        chip.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_CWE_BG),
            ("BOX", (0, 0), (-1, -1), 0.25, HexColor("#bfdbfe")),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        meta = Table([[chip, Paragraph(f"{filename}  line {line_number or 'N/A'}", styles["meta"])]], colWidths=[110, 366])
        meta.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))

        fix_box = Table([[Paragraph(_escape(issue.get("fix_suggestion") or "Apply secure coding remediation for this finding."), styles["fix"])]], colWidths=[476])
        fix_box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_FIX_BG),
            ("LINEBEFORE", (0, 0), (0, -1), 2, COLOR_SUCCESS),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))

        card = [
            header,
            Spacer(1, 6),
            meta,
            Spacer(1, 8),
            HRFlowable(width="100%", thickness=0.5, color=COLOR_BORDER),
            Spacer(1, 8),
            Paragraph("PROBLEM", styles["label"]),
            Spacer(1, 3),
            Paragraph(_escape(issue.get("description") or "Security issue detected."), styles["body"]),
            Spacer(1, 9),
            Paragraph("VULNERABLE CODE", styles["label"]),
            Spacer(1, 4),
            _build_code_table(str(affected_code), line_number or 1, styles),
            Spacer(1, 9),
            Paragraph("RECOMMENDED FIX", styles["label_green"]),
            Spacer(1, 4),
            fix_box,
        ]
        story.extend([KeepTogether(card), Spacer(1, 14)])

    corrected = scan_data.get("corrected_code") or ""
    if corrected and corrected != "None":
        story.extend([
            PageBreak(),
            Paragraph("Corrected Code", styles["section"]),
            Paragraph(f"Full corrected version of {scan_data.get('file_name') or scan_data.get('project_name') or 'source file'}", styles["subtle"]),
            Spacer(1, 10),
            _build_code_table(corrected, 1, styles, dark=True),
        ])

    def canvas_factory(*args, **kwargs):
        from reportlab.pdfgen import canvas as canvas_module
        return NumberedCanvas(canvas_module.Canvas(*args, **kwargs), report_name)

    doc.build(story, onFirstPage=_draw_cover, canvasmaker=canvas_factory)
    return buffer.getvalue()


def _build_csv(scan_data: Dict, vulnerabilities: List[Dict]) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["SecureGuard Full Scan Report"])
    writer.writerow([])
    writer.writerow(["Project", scan_data.get("project_name") or "Project"])
    writer.writerow(["Scan ID", scan_data.get("id") or scan_data.get("scan_id") or ""])
    writer.writerow(["Scan Type", scan_data.get("scan_type") or "Unknown"])
    writer.writerow(["Risk Level", scan_data.get("overall_risk_level") or scan_data.get("risk_level") or "Unknown"])
    writer.writerow(["Risk Score", scan_data.get("overall_risk_score") or scan_data.get("risk_score") or 0])
    writer.writerow(["Files Scanned", scan_data.get("files_scanned") or scan_data.get("files_analyzed") or 0])
    writer.writerow(["Total Vulnerabilities", scan_data.get("total_vulnerabilities") or scan_data.get("total_vulns") or len(vulnerabilities)])
    writer.writerow([])
    writer.writerow(["Chunk Summary"])
    writer.writerow(["Chunk", "Lines", "Issues", "Name"])
    for chunk in scan_data.get("chunk_outputs") or []:
        writer.writerow([
            chunk.get("chunk_index", ""),
            f"{chunk.get('start_line', '')}-{chunk.get('end_line', '')}",
            len(chunk.get("vulnerabilities") or []),
            chunk.get("chunk_name", ""),
        ])
    writer.writerow([])
    writer.writerow(["Vulnerability Details"])
    writer.writerow([
        "Severity",
        "CWE ID",
        "CWE Name",
        "File",
        "Line",
        "Vulnerable Code",
        "Explanation",
        "Fix Suggestion",
        "Function",
        "Location",
    ])
    for vuln in vulnerabilities:
        writer.writerow([
            str(vuln.get("severity") or "").upper(),
            vuln.get("cwe_id") or "",
            vuln.get("cwe_name") or vuln.get("type") or "",
            vuln.get("file_path") or "",
            vuln.get("line_number") or vuln.get("absolute_line") or "",
            vuln.get("affected_code") or vuln.get("code_snippet") or "",
            vuln.get("description") or "",
            vuln.get("fix_suggestion") or "",
            vuln.get("function_name") or "",
            vuln.get("location") or "",
        ])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


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
    _upload_zip(supabase, path, {"report.pdf": pdf_bytes})
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
    _upload_zip(supabase, path, {filename: content})
    return {"path": path, "expires_at": expires_at.isoformat(), "filename": filename, "format": safe_format}


def cleanup_expired_reports(supabase: Client) -> None:
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("reports")
        .select("id,file_path")
        .lt("expires_at", now)
        .execute()
    )
    paths = [row["file_path"] for row in result.data or [] if row.get("file_path")]
    if paths:
        supabase.storage.from_(REPORT_BUCKET).remove(paths)
        for row in result.data:
            supabase.table("reports").update({"file_path": None, "status": "failed"}).eq("id", row["id"]).execute()


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
