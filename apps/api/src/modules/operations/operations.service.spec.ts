import { OperationsService, OperationsWorkItem } from "./operations.service";

describe("OperationsService", () => {
  it("calculates specialist capacity independently for shared work", () => {
    const service = new OperationsService({} as never);
    const workload = (service as unknown as { workload(items: OperationsWorkItem[]): Array<{ owner: string; total: number; attention: number; capacityStatus: string }> }).workload(
      Array.from({ length: 12 }, (_, index) => ({
        id: `item-${index}`,
        kind: "TICKET" as const,
        reference: `AIT-${index}`,
        title: "Work item",
        clientName: null,
        status: "OPEN",
        priority: "NORMAL" as never,
        owner: "Alex Example, Blair Example",
        teamName: null,
        dueAt: null,
        updatedAt: new Date(),
        href: "/tickets/example",
        attention: index === 0,
        internalOwners: ["Alex Example", "Blair Example"]
      }))
    );

    expect(workload).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "Alex Example", total: 12, attention: 1, capacityStatus: "OVER_CAPACITY" }),
      expect.objectContaining({ owner: "Blair Example", total: 12, attention: 1, capacityStatus: "OVER_CAPACITY" })
    ]));
  });
});
