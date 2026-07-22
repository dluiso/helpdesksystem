import { BadGatewayException } from "@nestjs/common";
import { parseTicketBrief } from "./ticket-brief-parser";

describe("parseTicketBrief", () => {
  it("accepts a structured brief and constrains list and confidence values", () => {
    const result = parseTicketBrief(`\`\`\`json
      {"goal":" Restore access ","summary":"User cannot sign in.","recommendedActions":["One","Two","Three","Four","Five","Six"],"missingInformation":[],"risks":["Account lockout"],"suggestedResponse":" We are reviewing this. ","confidence":2}
    \`\`\``);

    expect(result.goal).toBe("Restore access");
    expect(result.recommendedActions).toHaveLength(5);
    expect(result.suggestedResponse).toBe("We are reviewing this.");
    expect(result.confidence).toBe(1);
  });

  it("rejects malformed or incomplete provider output", () => {
    expect(() => parseTicketBrief("not-json")).toThrow(BadGatewayException);
    expect(() => parseTicketBrief('{"summary":"Missing goal"}')).toThrow("AI ticket analysis is missing goal.");
  });
});
