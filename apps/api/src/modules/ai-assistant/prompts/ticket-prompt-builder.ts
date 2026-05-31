const SECRET_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi
];

export class TicketPromptBuilder {
  buildContext(input: { subject: string; messages: Array<{ bodyText: string; visibility: string }> }) {
    const visibleMessages = input.messages
      .filter((message) => message.visibility === "PUBLIC")
      .slice(-8)
      .map((message) => this.removeSecrets(message.bodyText))
      .join("\n\n");

    return this.removeSecrets(`Subject: ${input.subject}\n\nConversation:\n${visibleMessages}`);
  }

  removeSecrets(value: string) {
    return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), value);
  }
}
