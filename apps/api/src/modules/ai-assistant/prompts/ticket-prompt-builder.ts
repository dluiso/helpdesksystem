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

  buildEventContext(input: {
    trackingNumber: string;
    eventName: string;
    requesterName: string;
    requesterEmail: string;
    eventDate?: Date | null;
    startTime?: string | null;
    endTime?: string | null;
    services: string[];
    messages: Array<{ bodyText: string; visibility: string }>;
  }) {
    const visibleMessages = input.messages
      .filter((message) => message.visibility === "PUBLIC")
      .slice(-8)
      .map((message) => this.removeSecrets(message.bodyText))
      .join("\n\n");
    const dateText = input.eventDate ? input.eventDate.toISOString().slice(0, 10) : "No event date";
    return this.removeSecrets(
      [
        `Event: ${input.trackingNumber} - ${input.eventName}`,
        `Requester: ${input.requesterName} <${input.requesterEmail}>`,
        `Date/time: ${dateText} ${input.startTime ?? ""}${input.endTime ? ` - ${input.endTime}` : ""}`.trim(),
        `Services: ${input.services.join(", ") || "None"}`,
        "",
        "Requester conversation:",
        visibleMessages
      ].join("\n")
    );
  }

  removeSecrets(value: string) {
    return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), value);
  }
}
