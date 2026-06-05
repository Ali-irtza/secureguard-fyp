import smtplib
from email.message import EmailMessage
from html import escape

from app.config import settings


def is_email_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_username
        and settings.smtp_password
        and settings.smtp_from_email
    )


def send_team_invite_email(
    *,
    to_email: str,
    team_name: str,
    inviter_name: str,
    role: str,
    frontend_base_url: str,
) -> bool:
    if not is_email_configured():
        print("[email] SMTP not configured; skipped team invite email")
        return False

    app_url = frontend_base_url.rstrip("/")
    subject = f"You were added to {team_name} on SecureGuard"
    plain_body = (
        f"{inviter_name} added you to the SecureGuard team \"{team_name}\" as {role}.\n\n"
        f"Open SecureGuard to view the team:\n{app_url}/team\n"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px">You were added to a SecureGuard team</h2>
      <p>{escape(inviter_name)} added you to <strong>{escape(team_name)}</strong> as <strong>{escape(role)}</strong>.</p>
      <p>
        <a href="{escape(app_url)}/team"
           style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:6px">
          Open SecureGuard
        </a>
      </p>
    </div>
    """

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    message["To"] = to_email
    message.set_content(plain_body)
    message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        print(f"[email] sent team invite email to {to_email}")
        return True
    except Exception as exc:
        print(f"[email] failed to send team invite email to {to_email}: {exc}")
        return False
