export type GenerationStatus = "success" | "fallback" | "failed";

export type GenerationMetadata = {
  generationStatus: GenerationStatus;
  providerError?: string | null;
  fallbackReason?: string | null;
};

export type WriterGenerationResult<T> = GenerationMetadata & {
  data: T;
};

export const FALLBACK_REASON =
  "Provider 연결 실패로 임시 fallback 결과가 생성되었습니다. 실제 모델 결과가 아닙니다.";

export function getGenerationMetadata<T>(
  result: WriterGenerationResult<T>,
): GenerationMetadata {
  return {
    generationStatus: result.generationStatus,
    providerError: result.providerError ?? null,
    fallbackReason: result.fallbackReason ?? null,
  };
}

export function mergeGenerationMetadata(
  results: GenerationMetadata[],
): GenerationMetadata {
  const fallback = results.find((result) => result.generationStatus === "fallback");
  if (fallback) {
    return {
      generationStatus: "fallback",
      providerError: fallback.providerError ?? null,
      fallbackReason: fallback.fallbackReason ?? FALLBACK_REASON,
    };
  }

  const failed = results.find((result) => result.generationStatus === "failed");
  if (failed) {
    return {
      generationStatus: "failed",
      providerError: failed.providerError ?? null,
      fallbackReason: failed.fallbackReason ?? null,
    };
  }

  return { generationStatus: "success" };
}

export function buildGenerationMessage(
  metadata: Partial<GenerationMetadata> | null | undefined,
  successMessage: string,
) {
  if (metadata?.generationStatus === "fallback") {
    return metadata.fallbackReason ?? FALLBACK_REASON;
  }

  if (metadata?.generationStatus === "failed") {
    return metadata.providerError ?? "생성 요청에 실패했습니다.";
  }

  return successMessage;
}
