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
- Added a topbar theme toggle and improved dark-mode contrast for ticket status pills, read badges, conversations, signatures, and rich email content.

## 2026-06-04 - Ticket list contrast and editor readability

- Added a high-contrast ticket count pill for dark mode.
- Kept rich text editor surfaces light in dark mode to preserve readability and signature formatting.
- Added created and modified timestamps under each ticket subject so date columns can be hidden without losing context.

## 2026-06-04 - Dashboard statistics, spam management, and maintenance

- Added backend ticket statistics and a clickable Dashboard with status, priority, client, and technician workload filters.
- Added Spam Management with email/domain block entries, inbound email blocking, blocked email logging, and ticket-level block actions.
- Added Maintenance recycle bin settings, manual cleanup with confirmation, automatic retention cleanup, and audit logging.

## 2026-06-05 - Production deploy correction and ticket date layout

- Documented native systemd production update commands that explicitly load `.env.production` for Prisma and build without using `NODE_OPTIONS`.
- Updated ticket subject metadata so Created and Modified timestamps render on separate lines.

## 2026-06-05 - Settings polish and AI autocomplete

- Tightened the Settings layout spacing and scoped table/card wrapping fixes to avoid cramped rows and clipped safety-rule text.
- Added a configurable `complete_draft` AI action for ticket reply autocomplete.
- Added debounced inline AI suggestions in the ticket reply composer with accept and dismiss controls.
- Changed autocomplete from a separate suggestion bar to inline ghost text inside the reply editor, with cleanup before send/preview/tools.

## 2026-06-05 - Dashboard analytics redesign

- Expanded ticket statistics with 30-day activity, created-by-hour, source distribution, and short insight lists.
- Rebuilt the Dashboard with KPI cards, donut charts, bar charts, workload rankings, and clickable ticket insight rows.
- Added minimal ticket source filtering support so Dashboard source charts can open filtered ticket lists.
- Fixed ticket URL filter precedence so Dashboard links are not overwritten by a saved default ticket view.
- Changed the ticket status filter dropdown from hover-driven to click-controlled so it stays open while selecting multiple statuses.

## 2026-06-05 - Inbound attachment sync reliability

- Updated Microsoft Graph inbound attachment retrieval to follow paginated attachment responses.
- Added Office, ZIP, CSV, and PowerPoint MIME fallback detection when Graph omits attachment content type.
- Added a provider test covering paginated attachments and attachment detail retrieval for missing content bytes.

## 2026-06-06 - Event & Services module

- Added a separate Event & Services module with EVT tracking numbers, internal request management, assignments, tasks, comments, activity, and service/form administration.
- Added a public event request form with selectable services, 15-minute time intervals, requester confirmation email, and Cloudflare Turnstile support when enabled.
- Added `events.*` host routing so the public form can run from `events.aviditytechnologies.com` while sharing the same app services.
- Added event-service permissions, Prisma schema models, and a migration for production deployment.
