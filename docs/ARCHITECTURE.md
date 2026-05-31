# Architecture

The project is an npm-workspaces monorepo with isolated application and package boundaries.

```txt
apps/api   NestJS REST API, modules, guards, Prisma access, background job wiring
apps/web   Next.js dashboard shell and ticket UI placeholders
packages/shared   Shared constants and API-shaped types
packages/config   Runtime configuration types
packages/ui       Shared navigation constants
prisma            Schema and seed data
storage/local     Private local storage for attachments, exports, and temporary files
```

Backend modules follow a domain-oriented structure. The first milestone includes auth, users, permissions, clients, client domains, tickets, ticket messages, ticket attachments, file storage, system settings, mailboxes, auto-replies, signatures, AI assistant, reports, devices, remote access, audit logs, and notifications.

REST is the initial API style. WebSockets or event-driven messaging can be added later for endpoint agents and real-time ticket updates.
