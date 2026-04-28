import OpenAI from "openai";

import type { WriterReasoningEffort } from "@/lib/writer/reasoning-effort";
import {
  BaseProvider,
  type WriterCompletionInput,
} from "@/lib/writer/providers/base-provider";
import {
  buildChatCompletionRequest,
} from "@/lib/writer/providers/openai-compatible-payload";

type OpenAICompatibleProviderConfig = {
  model: string;
  baseURL: string;
  apiKey: string;
  mode: "api-key" | "oauth-proxy";
  reasoningEffort: WriterReasoningEffort;
};

export class OpenAICompatibleProvider extends BaseProvider {
  readonly providerName: string;
  readonly model: string;
  readonly mode: "api-key" | "oauth-proxy";
  readonly reasoningEffort: WriterReasoningEffort;
  private readonly client: OpenAI;

  constructor(config: OpenAICompatibleProviderConfig) {
    super();
    this.providerName = "openai-compatible";
    this.model = config.model;
    this.mode = config.mode;
    this.reasoningEffort = config.reasoningEffort;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async complete(input: WriterCompletionInput): Promise<string> {
    const completion = await this.client.chat.completions.create(
      buildChatCompletionRequest(this.model, input, this.reasoningEffort),
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("모델 응답이 비어 있습니다.");
    }

    return content;
  }
}
