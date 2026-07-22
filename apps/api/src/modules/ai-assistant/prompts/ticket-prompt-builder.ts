const SECRET_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi
];

const QUOTED_THREAD_MARKERS = [
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^on .+ wrote:$/i
];

const NOISE_PATTERNS = [
  /^external:\s*this email originated from outside/i,
  /^e-?mail confidentiality notice:/i,
  /^confidentiality notice:/i
];

const SIGNATURE_MARKERS = [/^best regards,?$/i, /^kind regards,?$/i, /^sincerely,?$/i, /^thank you,?$/i, /^--\s*$/];

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
    originalCustomerMessage?: { bodyText: string; createdAt: Date } | null;
    messages: Array<{ bodyText: string; visibility: string; direction: string; createdAt: Date }>;
  }) {
    const publicMessages = input.messages
      .filter((message) => message.visibility === "PUBLIC")
      .slice(-12);
    const formattedMessages = publicMessages.map((message) => {
      const author = message.direction === "INBOUND" ? "Customer" : "Technician";
      return `[${message.createdAt.toISOString()}] ${author}:\n${this.cleanEmailContent(message.bodyText).slice(0, 6000)}`;
    });
    const latestCustomerMessage = [...publicMessages].reverse().find((message) => message.direction === "INBOUND");
    const originalCustomerMessage = input.originalCustomerMessage ?? publicMessages.find((message) => message.direction === "INBOUND");
    const latestCustomerText = latestCustomerMessage ? this.cleanEmailContent(latestCustomerMessage.bodyText).slice(0, 6000) : "No customer message";
    const originalCustomerText = originalCustomerMessage ? this.cleanEmailContent(originalCustomerMessage.bodyText).slice(0, 6000) : "No customer message";

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
        "LATEST CUSTOMER UPDATE (highest priority when it conflicts with older content):",
        latestCustomerText,
        "",
        "ORIGINAL CUSTOMER REQUEST:",
        originalCustomerText,
        "",
        "PUBLIC CONVERSATION IN CHRONOLOGICAL ORDER (quoted email history and signatures removed):",
        formattedMessages.join("\n\n") || "No public messages"
      ].join("\n")
    );
  }

  buildWebReferenceSource(input: {
    subject: string;
    description?: string | null;
    originalCustomerMessage?: { bodyText: string } | null;
    messages: Array<{ bodyText: string; visibility: string; direction: string }>;
  }) {
    const customerSources = input.messages
      .filter((message) => message.visibility === "PUBLIC" && message.direction === "INBOUND")
      .map((message) => message.bodyText);

    return [...new Set([
      input.subject,
      input.description ?? "",
      input.originalCustomerMessage?.bodyText ?? "",
      ...customerSources
    ].filter(Boolean))].join("\n");
  }

  cleanEmailContent(value: string) {
    const lines = this.removeSecrets(value).replace(/\r\n?/g, "\n").split("\n");
    const content: string[] = [];

    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim();
      if (this.isQuotedThreadStart(lines, index) || QUOTED_THREAD_MARKERS.some((pattern) => pattern.test(trimmed))) break;
      if (NOISE_PATTERNS.some((pattern) => pattern.test(trimmed))) continue;
      content.push(line);
    }

    const firstContentIndex = content.findIndex((line) => Boolean(line.trim()));
    const signatureIndex = content.findIndex(
      (line, index) => index > firstContentIndex && SIGNATURE_MARKERS.some((pattern) => pattern.test(line.trim()))
    );
    const withoutSignature = signatureIndex >= 0 ? content.slice(0, signatureIndex) : content;

    return withoutSignature.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  private isQuotedThreadStart(lines: string[], index: number) {
    const line = lines[index]?.trim() ?? "";
    if (!/^from:\s.+$/i.test(line)) return false;
    if (/<[^>]+@[^>]+>|\S+@\S+/.test(line)) return true;

    const followingHeader = lines.slice(index + 1, index + 5).find((candidate) => Boolean(candidate.trim()))?.trim() ?? "";
    return /^(sent|date|to|subject):\s/i.test(followingHeader);
  }

  removeSecrets(value: string) {
    return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, "[redacted]"), value);
  }
}
