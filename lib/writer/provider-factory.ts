import { BaseProvider } from "@/lib/writer/providers/base-provider";
import { OpenAICompatibleProvider } from "@/lib/writer/providers/openai-compatible-provider";
import {
  getProviderRuntime,
  type ProviderRuntime,
  type WriterProviderMode,
} from "@/lib/writer/provider-settings";

export type { ProviderRuntime, WriterProviderMode };

export async function getWriterRuntime(): Promise<ProviderRuntime> {
  return getProviderRuntime();
}

export async function createWriterProvider(): Promise<BaseProvider> {
  const runtime = await getProviderRuntime();

  return new OpenAICompatibleProvider({
    mode: runtime.mode,
    model: runtime.model,
    baseURL: runtime.baseUrl,
    apiKey: runtime.apiKey,
    reasoningEffort: runtime.reasoningEffort,
  });
}
