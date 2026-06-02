# Work Log

## 2026-06-02 - Ticket Merging

- Added ticket merge data model, migration, and `tickets.merge` permission.
- Added API endpoints to search merge candidates and merge selected tickets into a primary ticket.
- Preserved source ticket identity on moved messages with `mergedFromTicketNumber` and `mergedFromTicketSubject`.
- Redirected inbound email replies from merged tickets to their primary ticket.
- Added merge actions to the ticket list and ticket detail views.
- Added UI indicators for merged tickets and message origins.
- Added focused service tests for merge behavior and reply blocking on merged tickets.
