# Security

The first milestone establishes the security shape rather than pretending every production control is finished.

- Passwords are hashed with Argon2id.
- Sessions use opaque random tokens stored only in HttpOnly cookies.
- Session tokens are hashed before database storage.
- Password hashes are never returned by API responses.
- Permission checks use permission strings, not role names.
- Sensitive actions write audit logs.
- Uploaded files are stored outside public web roots.
- Attachment download and preview routes require authentication and permissions.
- Suspicious or blocked attachments cannot be downloaded.
- Ticket and signature HTML pass through a sanitizer before browser rendering.
- Microsoft credentials and AI API keys are environment-provided, never hardcoded.

Future security work includes CSRF tokens, MFA enrollment, recovery code lifecycle, antivirus scanning, stricter content-type sniffing, account lockout tuning, and production reverse-proxy hardening.
