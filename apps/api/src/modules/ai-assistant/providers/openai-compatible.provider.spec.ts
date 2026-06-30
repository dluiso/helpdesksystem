import { OpenAiCompatibleProvider } from "./openai-compatible.provider";
import { AiProviderInput, AiProviderRuntimeConfig } from "./ai-provider.interface";

const baseInput: AiProviderInput = {
  action: "suggest_reply",
  draft: "Please continue this reply.",
  ticketContext: "Ticket context",
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxOutputTokens: 120
};

const config: AiProviderRuntimeConfig = {
  provider: "OPENAI_COMPATIBLE",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  timeoutMs: 30000
};

const fetchMock = jest.fn();

describe("OpenAiCompatibleProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    jest.spyOn(global, "fetch").mockImplementation(fetchMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses max_tokens for classic chat completion models", async () => {
    fetchMock.mockResolvedValue(successfulChatResponse("Connection succeeded."));

    await new OpenAiCompatibleProvider().complete(baseInput, config);

    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.any(Object));
    const body = requestBody();
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(120);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.max_output_tokens).toBeUndefined();
  });

  it("uses max_completion_tokens for modern models on OpenAI-compatible chat endpoints", async () => {
    fetchMock.mockResolvedValue(successfulChatResponse("Connection succeeded."));

    await new OpenAiCompatibleProvider().complete(
      { ...baseInput, model: "gpt-5.4-nano" },
      { ...config, baseUrl: "https://llm-gateway.example.com/v1" }
    );

    expect(fetchMock).toHaveBeenCalledWith("https://llm-gateway.example.com/v1/chat/completions", expect.any(Object));
    const body = requestBody();
    expect(body.model).toBe("gpt-5.4-nano");
    expect(body.max_completion_tokens).toBe(120);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_output_tokens).toBeUndefined();
  });

  it("uses Responses API for modern models on the official OpenAI endpoint", async () => {
    fetchMock.mockResolvedValue(successfulResponsesResponse("Connection succeeded."));

    const result = await new OpenAiCompatibleProvider().complete({ ...baseInput, model: "gpt-5.4-nano" }, config);

    expect(result.text).toBe("Connection succeeded.");
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.any(Object));
    const body = requestBody();
    expect(body.model).toBe("gpt-5.4-nano");
    expect(body.max_output_tokens).toBe(120);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.instructions).toContain("IT support technicians");
    expect(body.input).toContain("Ticket context");
  });
});

function requestBody() {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function successfulChatResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => ""
  } as Response;
}

function successfulResponsesResponse(content: string) {
  return {
    ok: true,
    json: async () => ({ output_text: content }),
    text: async () => ""
  } as Response;
}
