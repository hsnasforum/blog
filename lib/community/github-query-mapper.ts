import {
  applyAliasRules,
  compactQueryText,
  extractAsciiPhrases,
  pushUnique,
  type QueryAliasRule,
} from "./query-mapper";

export const GITHUB_QUERY_ALIAS_RULES: QueryAliasRule[] = [
  { label: "클로드", pattern: /클로드/g, replacement: "Claude" },
  { label: "클코", pattern: /클코/g, replacement: "Claude Code" },
  { label: "오푸스", pattern: /오푸스/g, replacement: "Opus" },
  { label: "코덱스", pattern: /코덱스/g, replacement: "Codex" },
  { label: "컨텍스트", pattern: /컨텍스트/g, replacement: "context" },
  { label: "컨텍", pattern: /컨텍/g, replacement: "context" },
  { label: "코파일럿", pattern: /코파일럿/g, replacement: "GitHub Copilot" },
  { label: "깃헙", pattern: /깃헙/g, replacement: "GitHub" },
  { label: "제미나이", pattern: /제미나이/g, replacement: "Gemini" },
  { label: "젬마", pattern: /젬마/g, replacement: "Gemma" },
  { label: "오픈AI", pattern: /오픈\s*AI/gi, replacement: "OpenAI" },
  { label: "OAI", pattern: /\bOAI\b/g, replacement: "OpenAI" },
  { label: "앤트로픽", pattern: /앤트로픽/g, replacement: "Anthropic" },
  { label: "엔트로픽", pattern: /엔트로픽/g, replacement: "Anthropic" },
  { label: "소라", pattern: /소라/g, replacement: "Sora" },
];

export type GitHubQueryMapping = {
  original: string;
  mappedText: string;
  matchedAliases: string[];
  queries: string[];
};

function normalizeKoreanSearchShorthand(value: string) {
  return compactQueryText(value)
    .replace(/100\s*만\s*컨텍(?:스트)?/gi, "1M context")
    .replace(/(\d+\s*M)\s*컨텍(?:스트)?/gi, "$1 context")
    .replace(/(\d+\s*M)\s*context/gi, "$1 context")
    .replace(/\b1\s*M\b/gi, "1M");
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function pushClaudeQueries(queries: string[], original: string, mappedText: string) {
  const haystack = `${original} ${mappedText}`;
  const hasClaude = includesAny(haystack, [/클로드/i, /Claude/i]);
  const hasClaudeCode = includesAny(haystack, [/클코/i, /Claude\s*Code/i]);
  const hasOpus = includesAny(haystack, [/오푸스/i, /Opus/i]);
  const hasPro = includesAny(haystack, [/프로/i, /\bPro\b/i]);

  if (!hasClaude && !hasClaudeCode && !hasOpus) return;

  if ((hasClaudeCode || hasClaude) && hasOpus) {
    pushUnique(queries, "Claude Code Opus availability");
    pushUnique(queries, "Claude Code Opus limit");
  }
  if (hasClaude && hasPro && hasOpus) pushUnique(queries, "Claude Pro Opus");
  if (hasClaude || hasClaudeCode) {
    pushUnique(queries, "Claude Code model availability");
    pushUnique(queries, "Claude Max usage limit");
    pushUnique(queries, "Claude Code subscription limit");
  }
  if ((hasClaudeCode || hasClaude) && hasOpus) pushUnique(queries, "Claude Code Opus");
  if (hasClaude || hasClaudeCode) pushUnique(queries, "Anthropic Claude Code");
  if (hasOpus) pushUnique(queries, "Opus model");
  if (hasClaudeCode) pushUnique(queries, "Claude Code");
}

function pushCodexQueries(queries: string[], original: string, mappedText: string) {
  const haystack = `${original} ${mappedText}`;
  const hasCodex = includesAny(haystack, [/코덱스/i, /Codex/i]);
  const hasContext = includesAny(haystack, [/컨텍/i, /context/i]);
  const hasOneMillion = includesAny(haystack, [/\b1\s*M\b/i, /\b1M\b/i, /100만/]);

  if (!hasCodex) return;

  if (hasOneMillion && hasContext) pushUnique(queries, "Codex 1M context");
  if (hasContext) {
    pushUnique(queries, "OpenAI Codex context window");
    pushUnique(queries, "Codex long context");
  }
  if (hasOneMillion) pushUnique(queries, "1M context");
  pushUnique(queries, "OpenAI Codex");
}

function pushCopilotQueries(queries: string[], original: string, mappedText: string) {
  const haystack = `${original} ${mappedText}`;
  const hasCopilot = includesAny(haystack, [/코파일럿/i, /Copilot/i]);
  const hasBilling = includesAny(haystack, [/정액제|종량제|가격|과금|결제/i, /billing|pricing|metered|subscription/i]);

  if (!hasCopilot) return;

  if (hasBilling) {
    pushUnique(queries, "GitHub Copilot premium requests");
    pushUnique(queries, "GitHub Copilot usage limit");
    pushUnique(queries, "GitHub Copilot metered premium requests");
    pushUnique(queries, "GitHub Copilot billing");
    pushUnique(queries, "GitHub Copilot subscription limit");
    pushUnique(queries, "GitHub Copilot Pro billing");
    pushUnique(queries, "GitHub Copilot usage based billing");
    pushUnique(queries, "GitHub Copilot metered billing");
    pushUnique(queries, "Copilot subscription billing");
    pushUnique(queries, "Copilot pricing");
    return;
  }

  pushUnique(queries, "GitHub Copilot");
}

function pushGeneralAliasQueries(queries: string[], mappedText: string) {
  if (/\b1M\s+context\b/i.test(mappedText)) pushUnique(queries, "1M context");
  pushUnique(queries, mappedText);
  for (const phrase of extractAsciiPhrases(mappedText)) {
    if (/^M\s+context\b/i.test(phrase)) continue;
    pushUnique(queries, phrase);
  }
}

export function mapCommunityTitleToGitHubQueries(value: string): GitHubQueryMapping {
  const original = normalizeKoreanSearchShorthand(value);
  const aliasResult = applyAliasRules(original, GITHUB_QUERY_ALIAS_RULES);
  const queries: string[] = [];

  pushClaudeQueries(queries, original, aliasResult.mapped);
  pushCodexQueries(queries, original, aliasResult.mapped);
  pushCopilotQueries(queries, original, aliasResult.mapped);
  pushGeneralAliasQueries(queries, aliasResult.mapped);

  return {
    original,
    mappedText: aliasResult.mapped,
    matchedAliases: aliasResult.matchedAliases,
    queries,
  };
}
