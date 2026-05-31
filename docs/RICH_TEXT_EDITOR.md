# Rich Text Editor

The first milestone includes an isolated ticket reply editor placeholder at:

```txt
apps/web/src/components/tickets/TicketReplyEditor.tsx
```

The production editor should be replaced with TipTap, Lexical, or another mature React editor. The backend already expects sanitized HTML and plain text for ticket messages.

Required editor capabilities:

- Public reply and internal note mode
- Formatting controls
- Link handling
- File attachments
- Pasted image handling
- Signature insertion
- Preview

All HTML must be sanitized before saving and before rendering.
