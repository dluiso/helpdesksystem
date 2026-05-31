# Local Development

Prerequisites:

- Windows 11 or Windows 10
- Docker Desktop
- Node.js 22 LTS
- PowerShell

Setup:

```powershell
Copy-Item .env.example .env
npm.cmd install
docker compose up -d
npm.cmd run prisma:generate
npm.cmd run prisma:migrate -- --name init
npm.cmd run prisma:seed
npm.cmd run dev
```

PowerShell may block `npm.ps1` depending on Execution Policy. Use `npm.cmd` or temporarily allow scripts for the current terminal:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Useful URLs:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/health`
- Mailpit: `http://localhost:8025`
- Prisma Studio: started with `npm run prisma:studio`

If ports `3000`, `4000`, `5432`, or `6379` are already in use, update `.env` and `docker-compose.yml` together.
