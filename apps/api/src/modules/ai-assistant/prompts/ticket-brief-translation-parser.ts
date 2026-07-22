import { BadGatewayException } from "@nestjs/common";

export interface TranslatableTicketBrief {
  goal: string;
  summary: string;
  recommendedActions: string[];
  missingInformation: string[];
  contradictions: string[];
  risks: string[];
}

export function parseTicketBriefTranslation(value: string, source: TranslatableTicketBrief): TranslatableTicketBrief {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new BadGatewayException("AI provider returned an invalid ticket translation.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadGatewayException("AI provider returned an invalid ticket translation.");
  }

  const record = parsed as Record<string, unknown>;
  const requiredText = (key: keyof TranslatableTicketBrief, maxLength: number) => {
    const text = typeof record[key] === "string" ? record[key].trim() : "";
    if (!text) throw new BadGatewayException(`AI ticket translation is missing ${key}.`);
    return text.slice(0, maxLength);
  };
  const requiredList = (key: "recommendedActions" | "missingInformation" | "contradictions" | "risks") => {
    const items = Array.isArray(record[key])
      ? record[key].filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 500))
      : [];
    if (items.length !== source[key].length) {
      throw new BadGatewayException(`AI ticket translation changed the number of ${key}.`);
    }
    return items;
  };

  const translation = {
    goal: requiredText("goal", 500),
    summary: requiredText("summary", 2000),
    recommendedActions: requiredList("recommendedActions"),
    missingInformation: requiredList("missingInformation"),
    contradictions: requiredList("contradictions"),
    risks: requiredList("risks")
  };
  const sourceTokens = protectedTokens(JSON.stringify(source));
  const translatedText = JSON.stringify(translation);
  const missingToken = sourceTokens.find((token) => !translatedText.includes(token));
  if (missingToken) {
    throw new BadGatewayException(`AI ticket translation did not preserve protected value ${missingToken}.`);
  }

  return translation;
}

function protectedTokens(value: string) {
  const patterns = [
    /https?:\/\/[^\s"<>]+/gi,
    /\b[A-Z]{2,}-\d{3,}\b/g,
    /\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi,
    /\+?\d[\d(). -]{6,}\d/g,
    /[$€£]?\b\d[\d.,:/-]*\b/g
  ];
  return [...new Set(patterns.flatMap((pattern) => value.match(pattern) ?? []).map((token) => token.replace(/["},]+$/, "")))];
}
