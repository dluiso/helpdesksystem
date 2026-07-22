import { BadGatewayException } from "@nestjs/common";
import { parseTicketBrief } from "./ticket-brief-parser";

describe("parseTicketBrief", () => {
  it("accepts a structured brief and constrains list and confidence values", () => {
    const result = parseTicketBrief(`\`\`\`json
      {"goal":" Restore access ","summary":"User cannot sign in.","recommendedActions":["One","Two","Three","Four","Five","Six"],"missingInformation":[],"risks":["Account lockout"],"contradictions":["Two different usernames were supplied"],"evidence":["2026-07-22 | Customer | Sign-in is blocked"],"suggestedResponse":" We are reviewing this. ","responseReady":true,"confidence":2}
    \`\`\``);

    expect(result.goal).toBe("Restore access");
    expect(result.recommendedActions).toHaveLength(5);
    expect(result.suggestedResponse).toBe("We are reviewing this.");
    expect(result.contradictions).toEqual(["Two different usernames were supplied"]);
    expect(result.evidence).toEqual(["2026-07-22 | Customer | Sign-in is blocked"]);
    expect(result.responseReady).toBe(false);
    expect(result.confidence).toBe(0.65);
  });

  it("rejects malformed or incomplete provider output", () => {
    expect(() => parseTicketBrief("not-json")).toThrow(BadGatewayException);
    expect(() => parseTicketBrief('{"summary":"Missing goal"}')).toThrow("AI ticket analysis is missing goal.");
  });

  it("defaults optional grounding fields to safe values", () => {
    const result = parseTicketBrief('{"goal":"Restore access","summary":"User cannot sign in.","recommendedActions":[],"missingInformation":[],"risks":[],"suggestedResponse":"Try again.","confidence":0.8}');

    expect(result.contradictions).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.responseReady).toBe(false);
  });

  it("blocks suggested responses without evidence", () => {
    const result = parseTicketBrief('{"goal":"Restore access","summary":"User cannot sign in.","recommendedActions":[],"missingInformation":[],"risks":[],"contradictions":[],"evidence":[],"suggestedResponse":"Try again.","responseReady":true,"confidence":0.8}');

    expect(result.responseReady).toBe(false);
  });

  it("allows a grounded response without unresolved contradictions", () => {
    const result = parseTicketBrief('{"goal":"Restore access","summary":"User cannot sign in.","recommendedActions":[],"missingInformation":[],"risks":[],"contradictions":[],"evidence":["2026-07-22 | Customer | Sign-in is blocked"],"suggestedResponse":"We will review the sign-in issue.","responseReady":true,"confidence":0.8}');

    expect(result.responseReady).toBe(true);
    expect(result.confidence).toBe(0.8);
  });
});
