# Work Log

## 2026-06-04 - Ticket URLs and notification delivery

- Added clean ticket URLs based on `ticketNumber`, while keeping UUID-based ticket URLs compatible for existing links.
- Split ticket notification preferences into independent in-app and email event toggles.
- Fixed the settings save payload so `New ticket created` preferences are persisted.
- Expanded ticket notification emails with ticket context and a direct `/tickets/{ticketNumber}` link.
- Added a Prisma migration for per-channel notification preference columns.

## 2026-06-04 - Tickets workspace productivity updates

- Compact ticket page header with search, saved views, filter toggle, new ticket action, columns, refresh, and recycle bin controls.
- Moved ticket filters into a collapsible advanced panel while preserving existing query behavior.
- Made bulk actions conditional on selected tickets and added priority to the bulk update controls.
- Added manual ticket creation from the ticket list using existing ticket creation and assignment endpoints.
- Added user-persisted ticket views for filters, sorting, columns, page size, and table density.
- Added inline specialist assignment from the ticket table using the existing assignment workflow.

## 2026-06-04 - Theme support

- Added light, dark, and system theme preferences with localStorage persistence.
- Added a profile Appearance section for theme selection.
- Added dark-mode CSS variables and converted core app surfaces, forms, tables, cards, modals, dropdowns, buttons, and badges to theme-aware colors.
