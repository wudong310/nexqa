import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmConfig } from "@nexqa/shared";
import type { LanguageModel } from "ai";

export function createLlmModel(config: LlmConfig): LanguageModel {
  if (config.provider === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    return anthropic(config.model);
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || "https://api.openai.com/v1",
  });
  return openai(config.model);
}
