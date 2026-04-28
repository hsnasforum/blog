import type OpenAI from "openai";

import { supportsReasoningEffort } from "@/lib/writer/model-capabilities";
import type { WriterReasoningEffort } from "@/lib/writer/reasoning-effort";
import type { WriterCompletionInput, WriterMessage } from "@/lib/writer/providers/base-provider";

function joinMessages(messages: WriterMessage[], role: WriterMessage["role"]) {
  return messages
    .filter((message) => message.role === role)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildChatCompletionRequest(
  model: string,
  input: WriterCompletionInput,
  reasoningEffort: WriterReasoningEffort,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: input.messages,
  };

  if (input.maxTokens !== undefined) {
    request.max_tokens = input.maxTokens;
  }

  if (input.responseFormat === "json") {
    request.response_format = { type: "json_object" };
  }

  if (supportsReasoningEffort(model)) {
    request.reasoning_effort = reasoningEffort;
  }

  return request;
}

export function buildResponsesRequest(
  model: string,
  input: WriterCompletionInput,
  reasoningEffort: WriterReasoningEffort,
): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  const instructions = joinMessages(input.messages, "system");
  const userInput = joinMessages(input.messages, "user") || instructions;
  const request: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model,
    input: userInput,
  };

  if (instructions && userInput !== instructions) {
    request.instructions = instructions;
  }

  if (input.maxTokens !== undefined) {
    request.max_output_tokens = input.maxTokens;
  }

  if (input.responseFormat === "json") {
    request.text = {
      format: { type: "json_object" },
    };
  }

  if (supportsReasoningEffort(model)) {
    request.reasoning = {
      effort: reasoningEffort,
    };
  }

  return request;
}

export function getResponseOutputText(response: OpenAI.Responses.Response) {
  const outputText = response.output_text?.trim();

  if (outputText) {
    return outputText;
  }

  return response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .map((content) => (content.type === "output_text" ? content.text : ""))
    .join("")
    .trim();
}
