import { BadGatewayException } from "@nestjs/common";
import { parseTicketBriefTranslation, TranslatableTicketBrief } from "./ticket-brief-translation-parser";

const source: TranslatableTicketBrief = {
  goal: "Update ticket AIT-100350 for waterdepartment@example.com.",
  summary: "Replace the phone number 708-215-4410 and preserve the $60 fee.",
  recommendedActions: ["Review https://example.com/water", "Confirm the $60 fee"],
  missingInformation: ["Confirm the final wording"],
  contradictions: [],
  risks: ["The phone number 708-215-4410 may be incorrect"]
};

describe("parseTicketBriefTranslation", () => {
  it("accepts a structurally equivalent contextual translation", () => {
    const result = parseTicketBriefTranslation(JSON.stringify({
      goal: "Actualizar el ticket AIT-100350 para waterdepartment@example.com.",
      summary: "Reemplazar el teléfono 708-215-4410 y conservar el cargo de $60.",
      recommendedActions: ["Revisar https://example.com/water", "Confirmar el cargo de $60"],
      missingInformation: ["Confirmar la redacción final"],
      contradictions: [],
      risks: ["El teléfono 708-215-4410 podría ser incorrecto"]
    }), source);

    expect(result.goal).toContain("Actualizar");
    expect(result.recommendedActions).toHaveLength(2);
  });

  it("rejects changed list cardinality and protected values", () => {
    expect(() => parseTicketBriefTranslation(JSON.stringify({ ...source, recommendedActions: [] }), source)).toThrow(BadGatewayException);
    expect(() => parseTicketBriefTranslation(JSON.stringify({ ...source, goal: "Actualizar la solicitud." }), source)).toThrow("did not preserve protected value");
  });
});
