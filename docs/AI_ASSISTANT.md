# AI Assistant

AI support uses a provider adapter pattern. The first provider is a mock provider for local development.

Initial actions:

- Improve draft reply
- Fix grammar
- Suggest reply
- Summarize ticket
- Translate reply
- Change tone

Safety rules:

- AI never sends customer messages automatically.
- AI output requires human approval.
- Ticket context is limited to recent public messages.
- Prompt building removes common secret patterns.
- Attachment contents are not sent to AI by default.
- AI usage writes `AiRequestLog` and audit entries.

Future providers will include OpenAI-compatible APIs and local Ollama.
