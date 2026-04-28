export type QueryAliasRule = {
  label: string;
  pattern: RegExp;
  replacement: string;
};

export function compactQueryText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function pushUnique(values: string[], value: string, maxLength = 90) {
  const compact = compactQueryText(value);
  if (!compact || compact.length > maxLength) return;
  const exists = values.some((item) => item.toLowerCase() === compact.toLowerCase());
  if (!exists) values.push(compact);
}

export function extractAsciiPhrases(value: string) {
  const phrases = compactQueryText(value).match(/[A-Za-z0-9][A-Za-z0-9._-]*(?:\s+[A-Za-z0-9][A-Za-z0-9._-]*){0,4}/g) ?? [];
  const result: string[] = [];

  for (const phrase of phrases) {
    const compact = compactQueryText(phrase);
    if (compact.length >= 2) pushUnique(result, compact);
  }

  return result;
}

export function applyAliasRules(value: string, rules: QueryAliasRule[]) {
  let mapped = compactQueryText(value);
  const matchedAliases: string[] = [];

  for (const rule of rules) {
    if (rule.pattern.test(mapped)) {
      matchedAliases.push(rule.label);
      mapped = mapped.replace(rule.pattern, rule.replacement);
    }
  }

  return {
    mapped: compactQueryText(mapped),
    matchedAliases,
  };
}
