import io
import textwrap
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from supabase import Client


REPORT_BUCKET = "scan-reports"
REPORT_TTL_DAYS = 5


def _pdf_escape(text: str) -> str:
    return str(text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_simple_pdf(title: str, lines: list[str]) -> bytes:
    content_lines = ["BT", "/F1 18 Tf", "50 790 Td", f"({_pdf_escape(title)}) Tj", "/F1 10 Tf", "0 -24 Td"]
    for line in lines:
        for wrapped in textwrap.wrap(line or " ", width=92) or [" "]:
            content_lines.append(f"({_pdf_escape(wrapped)}) Tj")
            content_lines.append("0 -14 Td")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{index} 0 obj\n".encode())
        pdf.write(obj)
        pdf.write(b"\nendobj\n")
    xref = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.write(f"{offset:010d} 00000 n \n".encode())
    pdf.write(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return pdf.getvalue()


def _report_lines(scan_data: Dict, vulnerabilities: List[Dict]) -> list[str]:
    lines = [
        f"Project: {scan_data.get('project_name') or 'Project'}",
        f"Risk: {scan_data.get('overall_risk_level') or scan_data.get('risk_level') or 'Unknown'}",
        f"Vulnerabilities: {len(vulnerabilities)}",
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
    corrected = scan_data.get("corrected_code") or ""
    if corrected and corrected != "None":
        lines.extend(["Corrected Code:", corrected[:4000]])
    return lines


def create_zipped_pdf_report(
    supabase: Client,
    user_id: str,
    scan_id: str,
    scan_data: Dict,
    vulnerabilities: List[Dict],
) -> dict:
    expires_at = datetime.now(timezone.utc) + timedelta(days=REPORT_TTL_DAYS)
    title = f"SecureGuard Scan Report - {scan_data.get('project_name') or scan_id}"
    pdf_bytes = _build_simple_pdf(title, _report_lines(scan_data, vulnerabilities))

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("report.pdf", pdf_bytes)

    path = f"{user_id}/{scan_id}/report.zip"
    supabase.storage.from_(REPORT_BUCKET).upload(
        path,
        zip_buffer.getvalue(),
        file_options={
            "content-type": "application/zip",
            "upsert": "true",
            "x-upsert": "true",
        },
    )
    return {"path": path, "expires_at": expires_at.isoformat()}


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
