import { env } from "@/lib/env";
import { OAUTH_PROXY_PLACEHOLDER_API_KEY } from "@/lib/writer/provider-defaults";
import {
  normalizeBaseUrl,
  type WriterProviderMode,
} from "@/lib/writer/provider-settings";

export type ProviderAuthCheckInput = {
  mode: WriterProviderMode;
  baseUrl: string;
};

export type ProviderAuthCheckResult = {
  ok: boolean;
  status: "authenticated" | "unauthenticated" | "unreachable";
  models: string[];
  message: string;
};

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

export async function checkProviderAuth(
  input: ProviderAuthCheckInput,
): Promise<ProviderAuthCheckResult> {
  const apiKey =
    input.mode === "api-key" ? env.OPENAI_API_KEY : env.OPENAI_API_KEY ?? OAUTH_PROXY_PLACEHOLDER_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      status: "unauthenticated",
      models: [],
      message: "api-key 모드에서는 OPENAI_API_KEY가 필요합니다.",
    };
  }

  try {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "unauthenticated",
        models: [],
        message:
          input.mode === "oauth-proxy"
            ? "OAuth proxy가 인증되지 않았거나 세션이 만료되었습니다."
            : "API key 인증에 실패했습니다.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: "unreachable",
        models: [],
        message: `모델 endpoint 확인 실패: HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as ModelsResponse;
    const models =
      payload.data
        ?.map((model) => model.id?.trim())
        .filter((model): model is string => Boolean(model)) ?? [];

    return {
      ok: true,
      status: "authenticated",
      models,
      message:
        input.mode === "oauth-proxy"
          ? "OAuth proxy 인증이 확인되었습니다."
          : "API key 인증이 확인되었습니다.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "unreachable",
      models: [],
      message: error instanceof Error ? error.message : "provider endpoint에 연결할 수 없습니다.",
    };
  }
}
