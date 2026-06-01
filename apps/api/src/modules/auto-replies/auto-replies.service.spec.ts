import { AutoRepliesService } from "./auto-replies.service";

describe("AutoRepliesService", () => {
  it("suppresses no-reply senders and auto-generated messages", () => {
    const service = new AutoRepliesService({} as never, {} as never, {} as never);

    expect(service.shouldSuppressAutoReply({ senderEmail: "no-reply@example.com" })).toBe(true);
    expect(service.shouldSuppressAutoReply({ senderEmail: "person@example.com", autoSubmittedHeader: "auto-replied" })).toBe(true);
    expect(service.shouldSuppressAutoReply({ senderEmail: "person@example.com" })).toBe(false);
  });
});
