# Avidity IT Management Tool

A modular IT management platform for MSP and internal support operations. The application name, company name, logo, support email, and colors are loaded from system settings so the product can be rebranded without changing core code.

## Tech Stack

- Backend: NestJS, TypeScript, Prisma, PostgreSQL
- Frontend: Next.js, React, TypeScript
- Background jobs: Redis and BullMQ foundation
- Auth: HttpOnly cookie sessions with Argon2id password hashing
- Storage: local file storage abstraction, designed for later S3-compatible providers
- Email: Microsoft Graph provider interface plus local mock provider

## Repository Structure

```txt
apps/
  api/                 NestJS backend
  web/                 Next.js frontend
packages/
  shared/              Shared constants and DTO-shaped types
  config/              Shared runtime config types
  ui/                  Shared navigation/UI constants
prisma/                Prisma schema and seed script
docker/                Development Dockerfiles
docs/                  Architecture and operating notes
storage/local/         Non-public local file storage
```

## Local Setup on Windows

From PowerShell:

```powershell
Copy-Item .env.example .env
npm.cmd install
docker compose up -d
npm.cmd run prisma:generate
npm.cmd run prisma:migrate -- --name init
npm.cmd run prisma:seed
npm.cmd run dev
```

If PowerShell blocks `npm.ps1`, either use `npm.cmd` as shown above or run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` for the current terminal session.

The API runs at `http://localhost:4000/api`, the web app runs at `http://localhost:3000`, and the health check is `http://localhost:4000/api/health`.

Default seed administrator:

```txt
Email: admin@aviditytechnologies.com
Password: ChangeMeNow!123
```

Change this password immediately after the first login. The seed marks the account for a future forced password-change workflow.

## Docker Compose

Start database, Redis, and Mailpit:

```powershell
docker compose up -d
```

Start the API and web containers too:

```powershell
docker compose --profile app up -d --build
```

Mailpit is available at `http://localhost:8025`.

## Production Deployment

Production deployment assets are included:

- `docker-compose.prod.yml`
- `docker/api.prod.Dockerfile`
- `docker/web.prod.Dockerfile`
- `docker/nginx/support.aviditytechnologies.com.bootstrap.conf`
- `docker/nginx/support.aviditytechnologies.com.conf`
- `.env.production.example`

For Debian, Docker Compose, Nginx, SSL, migrations, seeding, and update commands, see `docs/PRODUCTION_DEPLOYMENT.md`.

## Development Workflow

Useful commands:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run test
& "C:\Program Files\nodejs\npm.cmd" run prisma:studio
```

Run Prisma migrations after changing `prisma/schema.prisma`:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run prisma:migrate
```

For local inbound email testing, keep `MAIL_PROVIDER=mock` in `.env`. The API exposes `POST /api/mailboxes/:mailboxId/sync`, which pulls mock inbound messages, skips duplicates, maps the sender domain to a client, creates the requester contact when needed, and opens the ticket.

For real Microsoft 365 testing, configure the mailbox from `Settings > Mailboxes`. You can use either a direct support mailbox or a forwarded ingestion mailbox. Set an initial sync date before the first sync if you only want to import email from that date forward.

## File Storage Notes

Uploaded files are stored outside the frontend public directory under `storage/local`. Browser clients must download files through authenticated API endpoints. The API stores internal storage keys, file metadata, SHA-256 hashes, scan status, and audit events without exposing server-local paths.

## Attachment Security Notes

The first milestone blocks dangerous extensions, enforces maximum upload size through the validation service, models scan status, and blocks preview/download for suspicious or blocked files. HTML and SVG attachments must not be rendered inline unless a later sanitizer explicitly allows them.

## Documentation

See the `docs/` folder for architecture, security, database, Microsoft 365, AI, remote access, attachments, rich text, roadmap, and local development notes.
