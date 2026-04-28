export function isReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();

  if (/^gpt-5(?:$|[.-])/.test(normalized)) {
    return true;
  }

  if (/^codex(?:$|[.-])/.test(normalized)) {
    return true;
  }

  return normalized === "codex-auto-review";
}

export function supportsTemperature(model: string): boolean {
  return !isReasoningModel(model);
}

export function supportsReasoningEffort(model: string): boolean {
  return isReasoningModel(model);
}

export function getDefaultReasoningEffort(model: string): "medium" | "high" {
  const normalized = model.trim().toLowerCase();

  if (normalized === "gpt-5-pro" || normalized.startsWith("gpt-5-pro-")) {
    return "high";
  }

  return "medium";
}
