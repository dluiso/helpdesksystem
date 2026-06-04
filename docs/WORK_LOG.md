# Work Log

## 2026-06-04 - Ticket URLs and notification delivery

- Added clean ticket URLs based on `ticketNumber`, while keeping UUID-based ticket URLs compatible for existing links.
- Split ticket notification preferences into independent in-app and email event toggles.
- Fixed the settings save payload so `New ticket created` preferences are persisted.
- Expanded ticket notification emails with ticket context and a direct `/tickets/{ticketNumber}` link.
- Added a Prisma migration for per-channel notification preference columns.
