import type { ProviderConfig } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_OAUTH_PROXY_BASE_URL,
  DEFAULT_OPENAI_BASE_URL,
  OAUTH_PROXY_PLACEHOLDER_API_KEY,
} from "@/lib/writer/provider-defaults";
import {
  resolveWriterReasoningEffort,
  type WriterReasoningEffort,
} from "@/lib/writer/reasoning-effort";

export type WriterProviderMode = "api-key" | "oauth-proxy";

export type ProviderSettingsInput = {
  mode: WriterProviderMode;
  baseUrl: string;
  model: string;
};

export type ProviderRuntime = ProviderSettingsInput & {
  provider: string;
  apiKey: string;
  reasoningEffort: WriterReasoningEffort;
  reasoningEffortWarning: string | null;
};

export const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";

export function getDefaultProviderSettings(): ProviderSettingsInput {
  return {
    mode: env.WRITER_PROVIDER,
    baseUrl:
      env.OPENAI_BASE_URL ??
      (env.WRITER_PROVIDER === "oauth-proxy" ? DEFAULT_OAUTH_PROXY_BASE_URL : DEFAULT_OPENAI_BASE_URL),
    model: env.WRITER_MODEL,
  };
}

export function getConfiguredModelOptions(selectedModel?: string | null): string[] {
  const defaults = getDefaultProviderSettings();
  const envOptions =
    env.WRITER_MODEL_OPTIONS?.split(",")
      .map((model) => model.trim())
      .filter(Boolean) ?? [];
  const unique = new Set([defaults.model, selectedModel ?? "", ...envOptions].filter(Boolean));
  return Array.from(unique);
}

export function normalizeProviderMode(mode: string): WriterProviderMode {
  return mode === "api-key" ? "api-key" : "oauth-proxy";
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export async function ensureProviderConfig(): Promise<ProviderConfig> {
  const defaults = getDefaultProviderSettings();

  return prisma.providerConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      provider: OPENAI_COMPATIBLE_PROVIDER,
      mode: defaults.mode,
      baseUrl: normalizeBaseUrl(defaults.baseUrl),
      model: defaults.model,
    },
  });
}

export async function updateProviderConfig(input: ProviderSettingsInput): Promise<ProviderConfig> {
  return prisma.providerConfig.upsert({
    where: { id: "default" },
    update: {
      provider: OPENAI_COMPATIBLE_PROVIDER,
      mode: input.mode,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      model: input.model.trim(),
    },
    create: {
      id: "default",
      provider: OPENAI_COMPATIBLE_PROVIDER,
      mode: input.mode,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      model: input.model.trim(),
    },
  });
}

export async function getProviderRuntime(): Promise<ProviderRuntime> {
  const config = await ensureProviderConfig();
  const mode = normalizeProviderMode(config.mode);
  const apiKey =
    mode === "api-key" ? env.OPENAI_API_KEY : env.OPENAI_API_KEY ?? OAUTH_PROXY_PLACEHOLDER_API_KEY;
  const reasoningEffort = resolveWriterReasoningEffort(config.model);

  if (!apiKey) {
    throw new Error("api-key 모드에서는 OPENAI_API_KEY가 필요합니다.");
  }

  return {
    provider: OPENAI_COMPATIBLE_PROVIDER,
    mode,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: config.model,
    apiKey,
    reasoningEffort: reasoningEffort.effort,
    reasoningEffortWarning: reasoningEffort.warning,
  };
}
