import { OperationsService, OperationsWorkItem } from "./operations.service";

describe("OperationsService", () => {
  it("calculates specialist capacity independently for shared work", () => {
    const service = new OperationsService({} as never, {} as never);
    const workload = (service as unknown as { workload(items: OperationsWorkItem[], capacityBaseline: number, capacityWarningPercent: number): Array<{ owner: string; total: number; attention: number; capacityStatus: string }> }).workload(
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
      })),
      12,
      75
    );

    expect(workload).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "Alex Example", total: 12, attention: 1, capacityStatus: "OVER_CAPACITY" }),
      expect.objectContaining({ owner: "Blair Example", total: 12, attention: 1, capacityStatus: "OVER_CAPACITY" })
    ]));
  });

  it("uses the configured warning threshold before capacity is exceeded", () => {
    const service = new OperationsService({} as never, {} as never);
    const workload = (service as unknown as { workload(items: OperationsWorkItem[], capacityBaseline: number, capacityWarningPercent: number): Array<{ capacityStatus: string }> }).workload(
      Array.from({ length: 8 }, (_, index) => ({
        id: `item-${index}`,
        kind: "TICKET" as const,
        reference: `AIT-${index}`,
        title: "Work item",
        clientName: null,
        status: "OPEN",
        priority: "NORMAL" as never,
        owner: "Alex Example",
        teamName: null,
        dueAt: null,
        updatedAt: new Date(),
        href: "/tickets/example",
        attention: false,
        internalOwners: ["Alex Example"]
      })),
      12,
      60
    );

    expect(workload).toEqual([expect.objectContaining({ capacityStatus: "NEAR_CAPACITY" })]);
  });

  it("adds project commitments to projected capacity without treating them as operational work", () => {
    const service = new OperationsService({} as never, {} as never);
    const workload = (service as unknown as { workload(items: OperationsWorkItem[], capacityBaseline: number, capacityWarningPercent: number, projectCommitments: Array<{ owner: string; attention: boolean }>): Array<{ owner: string; operational: number; projectCommitments: number; total: number; attention: number; capacityStatus: string }> }).workload(
      Array.from({ length: 4 }, (_, index) => ({
        id: `item-${index}`,
        kind: "TICKET" as const,
        reference: `AIT-${index}`,
        title: "Work item",
        clientName: null,
        status: "OPEN",
        priority: "NORMAL" as never,
        owner: "Alex Example",
        teamName: null,
        dueAt: null,
        updatedAt: new Date(),
        href: "/tickets/example",
        attention: false,
        internalOwners: ["Alex Example"]
      })),
      7,
      75,
      [
        { owner: "Alex Example", attention: false },
        { owner: "Alex Example", attention: true },
        { owner: "Alex Example", attention: false }
      ]
    );

    expect(workload).toEqual([expect.objectContaining({ owner: "Alex Example", operational: 4, projectCommitments: 3, total: 7, attention: 1, capacityStatus: "OVER_CAPACITY" })]);
  });
});
