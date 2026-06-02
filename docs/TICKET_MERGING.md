# Ticket Merging

Ticket merging consolidates related tickets into one primary ticket while preserving where each merged message came from.

## Workflow

1. Open a ticket and use `Merge` in the page header or `Ticket Tools`.
2. Search for related tickets by number, subject, client, domain, or requester.
3. Select one or more source tickets.
4. Optionally add a merge reason.
5. Confirm the merge.

The ticket list also supports merging selected tickets in bulk. The user chooses which selected ticket remains primary before confirming.

## Data Behavior

- The primary ticket remains active and keeps its original status.
- Source tickets are marked `MERGED`.
- Source tickets store the primary ticket id in `mergedIntoTicketId`.
- Messages from source tickets are moved to the primary ticket.
- Moved messages keep `mergedFromTicketNumber` and `mergedFromTicketSubject` so the conversation can show their origin.
- Attachments from source tickets are moved to the primary ticket.
- Watchers from source tickets are copied to the primary ticket.
- An internal summary note is added to the primary ticket.
- Direct replies on merged source tickets are blocked.
- Inbound email replies that match a merged ticket are redirected to the primary ticket and marked with the source ticket metadata.

## Permissions

The feature uses `tickets.merge`. The permission is seeded for operational ticket roles during migration and shared permission initialization.

## Deployment Notes

This feature includes a Prisma migration. Production deployment must run Prisma client generation and `prisma migrate deploy` before restarting services.
