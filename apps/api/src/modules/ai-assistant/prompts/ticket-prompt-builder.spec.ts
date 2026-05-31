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
});
