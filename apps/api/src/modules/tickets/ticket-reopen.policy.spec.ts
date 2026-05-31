import { TicketStatus } from "@prisma/client";
import { shouldReopenClosedTicket } from "./ticket-reopen.policy";

describe("shouldReopenClosedTicket", () => {
  it("reopens closed tickets inside the configured window", () => {
    expect(
      shouldReopenClosedTicket({
        status: TicketStatus.CLOSED,
        closedAt: new Date("2026-05-01T00:00:00Z"),
        receivedAt: new Date("2026-05-10T00:00:00Z"),
        reopenWindowDays: 14
      })
    ).toBe(true);
  });

  it("does not reopen closed tickets outside the configured window", () => {
    expect(
      shouldReopenClosedTicket({
        status: TicketStatus.CLOSED,
        closedAt: new Date("2026-05-01T00:00:00Z"),
        receivedAt: new Date("2026-05-20T00:00:00Z"),
        reopenWindowDays: 14
      })
    ).toBe(false);
  });
});
