import { env } from "@/lib/env";
import { getDefaultReasoningEffort } from "@/lib/writer/model-capabilities";

export const reasoningEffortValues = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type WriterReasoningEffort = (typeof reasoningEffortValues)[number];

export type ReasoningEffortResolution = {
  effort: WriterReasoningEffort;
  warning: string | null;
};

export function isWriterReasoningEffort(value: string): value is WriterReasoningEffort {
  return reasoningEffortValues.includes(value as WriterReasoningEffort);
}

export function resolveWriterReasoningEffort(model: string): ReasoningEffortResolution {
  const raw = env.WRITER_REASONING_EFFORT?.trim();

  if (!raw) {
    return {
      effort: getDefaultReasoningEffort(model),
      warning: null,
    };
  }

  if (isWriterReasoningEffort(raw)) {
    return {
      effort: raw,
      warning: null,
    };
  }

  const warning = `WRITER_REASONING_EFFORT=${raw} 값은 허용되지 않아 medium으로 대체했습니다.`;
  console.warn(warning);

  return {
    effort: "medium",
    warning,
  };
}
