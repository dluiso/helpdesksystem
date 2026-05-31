# Database

Prisma models use UUID primary keys and human-readable ticket numbers. Business records support soft deletion where appropriate; audit logs are append-only.

Core entities include:

- Organization and SystemSetting
- User, Session, Group, Role, Permission
- Client, ClientDomain, Contact
- Mailbox
- Ticket, TicketMessage, TicketAttachment, StoredFile
- AutoReplyTemplate and AutoReplyHistory
- UserSignature
- AiRequestLog
- KnowledgeCategory and KnowledgeArticle
- ReportExport
- Device and RemoteAccessProfile
- AuditLog

Ticket numbers are generated through the `TicketSequence` model and begin at `AIT-100001`.

Run migrations with:

```powershell
npm run prisma:migrate
```
