# Attachments and Storage

Attachments are treated as untrusted content.

Current foundation:

- Local storage provider under `storage/local`
- Internal generated filenames
- Original filenames preserved in the database
- SHA-256 hashes stored
- MIME type, extension, and size stored
- Scan status and scan result modeled
- Authenticated download and preview endpoints
- Audit logs for preview, download, deletion, and future uploads

Blocked extensions include executable and script formats such as `.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.scr`, and `.reg`.

Allowed preview MIME types start with PNG, JPEG, GIF, WebP, PDF, and plain text.
