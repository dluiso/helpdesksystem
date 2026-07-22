import { BadGatewayException } from "@nestjs/common";

export interface TicketBriefPayload {
  goal: string;
  summary: string;
  recommendedActions: string[];
  missingInformation: string[];
  risks: string[];
  contradictions: string[];
  evidence: string[];
  suggestedResponse: string | null;
  responseReady: boolean;
  confidence: number | null;
}

export function parseTicketBrief(value: string): TicketBriefPayload {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new BadGatewayException("AI provider returned an invalid ticket analysis.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadGatewayException("AI provider returned an invalid ticket analysis.");
  }

  const record = parsed as Record<string, unknown>;
  const requiredText = (key: string, maxLength: number) => {
    const text = typeof record[key] === "string" ? record[key].trim() : "";
    if (!text) throw new BadGatewayException(`AI ticket analysis is missing ${key}.`);
    return text.slice(0, maxLength);
  };
  const textList = (key: string) =>
    (Array.isArray(record[key]) ? record[key] : [])
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .slice(0, 5)
      .map((item) => item.trim().slice(0, 500));
  const contradictions = textList("contradictions");
  const evidence = textList("evidence");
  const suggestedResponse = typeof record.suggestedResponse === "string" ? record.suggestedResponse.trim().slice(0, 5000) || null : null;
  const parsedConfidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
    ? Math.min(1, Math.max(0, record.confidence))
    : null;
  const confidence = parsedConfidence === null || contradictions.length === 0 ? parsedConfidence : Math.min(parsedConfidence, 0.65);

  return {
    goal: requiredText("goal", 500),
    summary: requiredText("summary", 2000),
    recommendedActions: textList("recommendedActions"),
    missingInformation: textList("missingInformation"),
    risks: textList("risks"),
    contradictions,
    evidence,
    suggestedResponse,
    responseReady: record.responseReady === true && contradictions.length === 0 && evidence.length > 0 && Boolean(suggestedResponse),
    confidence
  };
}
