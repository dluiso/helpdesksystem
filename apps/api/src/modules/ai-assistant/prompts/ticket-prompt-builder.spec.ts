import { TicketPromptBuilder } from "./ticket-prompt-builder";

describe("TicketPromptBuilder", () => {
  it("redacts common secret patterns", () => {
    const builder = new TicketPromptBuilder();

    expect(builder.removeSecrets("password=super-secret token: abc123")).toContain("[redacted]");
  });

  it("uses only public messages for ticket context", () => {
    const builder = new TicketPromptBuilder();
    const context = builder.buildContext({
      subject: "VPN issue",
      messages: [
        { visibility: "INTERNAL", bodyText: "Internal-only note" },
        { visibility: "PUBLIC", bodyText: "Customer-facing text" }
      ]
    });

    expect(context).toContain("Customer-facing text");
    expect(context).not.toContain("Internal-only note");
  });

  it("builds an operational context without internal notes or common secrets", () => {
    const builder = new TicketPromptBuilder();
    const context = builder.buildOperationalContext({
      ticketNumber: "AIT-100001",
      subject: "Microsoft 365 access",
      description: "User cannot sign in",
      status: "NEW",
      priority: "HIGH",
      clientName: "Example Client",
      requesterName: "Alex User",
      requesterEmail: "alex@example.com",
      messages: [
        { visibility: "INTERNAL", direction: "OUTBOUND", bodyText: "Internal token=hidden-value", createdAt: new Date("2026-07-22T10:00:00Z") },
        { visibility: "PUBLIC", direction: "INBOUND", bodyText: "My password=do-not-share and sign-in is blocked", createdAt: new Date("2026-07-22T10:01:00Z") }
      ]
    });

    expect(context).toContain("AIT-100001");
    expect(context).toContain("Customer:");
    expect(context).toContain("[redacted]");
    expect(context).not.toContain("Internal token");
    expect(context).not.toContain("do-not-share");
  });
});
