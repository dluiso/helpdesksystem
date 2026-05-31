import { TicketStatus } from "@prisma/client";

export interface TicketReopenPolicyInput {
  status: TicketStatus;
  closedAt: Date | null;
  receivedAt: Date;
  reopenWindowDays: number;
}

export function shouldReopenClosedTicket(input: TicketReopenPolicyInput): boolean {
  if (input.status !== TicketStatus.CLOSED || !input.closedAt) {
    return false;
  }

  const reopenWindowMs = input.reopenWindowDays * 24 * 60 * 60 * 1000;
  return input.receivedAt.getTime() - input.closedAt.getTime() <= reopenWindowMs;
}
