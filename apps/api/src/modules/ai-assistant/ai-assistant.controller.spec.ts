import { REQUIRED_PERMISSIONS_KEY } from "../permissions/decorators/require-permissions.decorator";
import { AiAssistantController } from "./ai-assistant.controller";

describe("AiAssistantController permissions", () => {
  const controller = AiAssistantController.prototype;

  it("requires ticket visibility for ticket analysis", () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller.getBrief)).toEqual(["ai_assistant.use", "tickets.view"]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller.generateBrief)).toEqual(["ai_assistant.use", "tickets.view"]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller.translateBrief)).toEqual(["ai_assistant.use", "tickets.view"]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller.summarize)).toEqual(["ai_assistant.use", "tickets.view"]);
  });

  it("also requires reply permission for AI writing actions", () => {
    for (const handler of [controller.improveReply, controller.fixGrammar, controller.suggestReply, controller.completeDraft, controller.translate, controller.changeTone, controller.paraphrase]) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual(["ai_assistant.use", "tickets.view", "tickets.reply"]);
    }
  });
});
