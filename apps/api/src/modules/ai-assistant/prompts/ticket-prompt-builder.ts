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

  buildOperationalContext(input: {
    ticketNumber: string;
    subject: string;
    description?: string | null;
    status: string;
    priority: string;
    clientName?: string | null;
    requesterName?: string | null;
    requesterEmail?: string | null;
    messages: Array<{ bodyText: string; visibility: string; direction: string; createdAt: Date }>;
  }) {
    const visibleMessages = input.messages
      .filter((message) => message.visibility === "PUBLIC")
      .slice(-12)
      .map((message) => {
        const author = message.direction === "INBOUND" ? "Customer" : "Technician";
        return `[${message.createdAt.toISOString()}] ${author}:\n${this.removeSecrets(message.bodyText).slice(0, 6000)}`;
      })
      .join("\n\n");

    return this.removeSecrets(
      [
        `Ticket: ${input.ticketNumber}`,
        `Subject: ${input.subject}`,
        `Description: ${input.description ?? "Not provided"}`,
        `Status: ${input.status}`,
        `Priority: ${input.priority}`,
        `Client: ${input.clientName ?? "Not assigned"}`,
        `Requester: ${input.requesterName ?? "Unknown"}${input.requesterEmail ? ` <${input.requesterEmail}>` : ""}`,
        "",
        "Public conversation (untrusted customer and technician content):",
        visibleMessages || "No public messages"
      ].join("\n")
    );
  }

  removeSecrets(value: string) {
    return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), value);
  }
}
