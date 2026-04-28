import {
  classifySignalType,
  clamp,
  detectCommunityRisk,
  daysSince,
  stripHtmlTags,
  summarizeSignal,
} from "@/lib/community/community-utils";
import type {
  CommunityRiskLevel,
  CommunitySignalType,
  CommunityVerificationStatus,
} from "@/lib/community/community-types";
import {
  GITHUB_ISSUES_SOURCE_NAME,
  GITHUB_ISSUES_SOURCE_TYPE,
  type GitHubIssueClassification,
  type GitHubIssueItem,
  type GitHubIssueNormalizationContext,
  type GitHubIssueSignalMeta,
  type NormalizedGitHubIssueSignal,
} from "@/lib/community/collectors/github/github-types";

const OFFICIAL_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function labelNames(item: GitHubIssueItem) {
  return (item.labels ?? [])
    .map((label) => String(label.name ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function repositoryFromUrl(repositoryUrl: string) {
  try {
    const parsed = new URL(repositoryUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const reposIndex = parts.indexOf("repos");
    if (reposIndex >= 0 && parts[reposIndex + 1] && parts[reposIndex + 2]) {
      return `${parts[reposIndex + 1]}/${parts[reposIndex + 2]}`;
    }
  } catch {
    return "unknown/unknown";
  }

  return "unknown/unknown";
}

function classifyByGitHubLabels(title: string, labels: string[]): CommunitySignalType {
  const haystack = `${title} ${labels.join(" ")}`.toLowerCase();

  if (/breaking[-_\s]?change|breaking|regression|deprecat|migration|major\s*change|호환성|회귀|깨짐/.test(haystack)) {
    return "breaking_change";
  }
  if (/pricing|billing|subscription|plan|quota|invoice|payment|가격|과금|결제|정액제|종량제/.test(haystack)) {
    return "pricing_change";
  }
  if (/documentation|docs|doc|guide|readme|example|문서|가이드|예제/.test(haystack)) {
    return "documentation_issue";
  }
  if (/bug|crash|broken|error|exception|fail|failure|오류|에러|크래시|실패|작동\s*안\s*됨/.test(haystack)) {
    return "bug_report";
  }
  if (/outage|unavailable|timeout|rate\s*limit|quota|incident|장애|중단|제한/.test(haystack)) {
    return "operational_issue";
  }
  if (/question|help|how\s*to|confus|beginner|초보|헷갈|질문/.test(haystack)) {
    return "beginner_confusion";
  }

  const fallback = classifySignalType(haystack);
  if (fallback === "common_complaint") return "community_reaction";
  return fallback;
}

function classifyRisk(title: string, signalType: CommunitySignalType): CommunityRiskLevel {
  const detected = detectCommunityRisk(title);
  if (detected.riskLevel === "high" || detected.riskLevel === "blocked") return detected.riskLevel;
  if (detected.riskLevel === "medium") return "medium";
  if (signalType === "rumor") return "medium";
  return "low";
}

function classifyVerification(_authorAssociation: string | null, _riskLevel: CommunityRiskLevel): CommunityVerificationStatus {
  return "needs_manual_review";
}

function searchableTokens(value: string) {
  return stripHtmlTags(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !["issue", "model", "change", "github", "the", "and"].includes(token));
}

function tokenMatchRatio(needles: string[], haystack: string) {
  if (needles.length === 0) return 0;
  const normalizedHaystack = haystack.toLowerCase();
  const matched = needles.filter((token) => normalizedHaystack.includes(token)).length;
  return matched / needles.length;
}

function maxQueryMatchScore(haystackValue: string, values: string[], maxScore: number) {
  const haystack = haystackValue.toLowerCase();
  const ratios = values.map((value) => tokenMatchRatio(searchableTokens(value), haystack));
  const maxRatio = Math.max(0, ...ratios);
  return Math.round(maxRatio * maxScore);
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function intentFlags(values: string[]) {
  const haystack = values.join(" ").toLowerCase();
  return {
    claude: hasAny(haystack, [/claude|anthropic|opus/]),
    codex: hasAny(haystack, [/codex|openai/]),
    copilot: hasAny(haystack, [/copilot/]),
    billing: hasAny(haystack, [/billing|pricing|metered|premium|request|subscription|usage|limit|quota/]),
    context: hasAny(haystack, [/\b1\s*m\b|\b1m\b|context|window|token/]),
    availability: hasAny(haystack, [/opus|model|usage|limit|subscription|availability|unavailable|provided|billing/]),
  };
}

function repoAffinityScore(repository: string, title: string, flags: ReturnType<typeof intentFlags>) {
  const repo = repository.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  if (flags.codex) {
    if (repo === "openai/codex") return 18;
    if (repo === "openai/openai-cookbook") return 8;
    if (repo.startsWith("openai/")) return 6;
    return -8;
  }

  if (flags.claude) {
    if (repo === "anthropics/claude-code") return 18;
    if (repo.startsWith("anthropics/")) return 12;
    if (repo.includes("claude") || normalizedTitle.includes("claude")) return 6;
    return -8;
  }

  if (flags.copilot) {
    if (repo.includes("copilot")) return 15;
    if (repo === "microsoft/vscode" && normalizedTitle.includes("copilot")) return 10;
    if (repo.startsWith("github/") && normalizedTitle.includes("copilot")) return 10;
    if (repo.includes("opencode") && normalizedTitle.includes("copilot")) return 6;
    if (normalizedTitle.includes("copilot")) return 4;
    return -8;
  }

  return 0;
}

function intentPenalty(title: string, repository: string, flags: ReturnType<typeof intentFlags>) {
  const haystack = `${title} ${repository}`.toLowerCase();
  let penalty = 0;

  if (flags.billing && !hasAny(haystack, [/billing|pricing|usage|premium|requests?|subscription|metered|limit|quota|plan/])) {
    penalty += 18;
  }

  if (flags.claude && flags.availability && !hasAny(haystack, [/opus|model|usage|limit|subscription|availability|unavailable|exhaust|billing|max|plan/])) {
    penalty += 18;
  }

  if (flags.codex && flags.context && !hasAny(haystack, [/\b1\s*m\b|\b1m\b|context|window|token/])) {
    penalty += 18;
  }

  if (flags.copilot && !haystack.includes("copilot")) {
    penalty += 14;
  }

  return penalty;
}

export function calculateGitHubIssueRelevance(
  item: GitHubIssueItem,
  repository: string,
  context: GitHubIssueNormalizationContext,
) {
  const title = stripHtmlTags(item.title);
  const matchedSearchTerms = context.matchedQueries.map((query) => query.searchTerm);
  const allSearchTerms = context.searchQueries.map((query) => query.searchTerm);
  const flags = intentFlags([...context.originalTexts, ...allSearchTerms]);
  const queryTitleScore = maxQueryMatchScore(title, matchedSearchTerms, 34);
  const originalTextScore = maxQueryMatchScore(title, context.originalTexts, 14);
  const repoScore = repoAffinityScore(repository, title, flags);
  const engagementScore = clamp(Math.round(Math.log1p((item.comments ?? 0) + (item.reactions?.total_count ?? 0)) * 4), 0, 14);
  const updatedAt = new Date(item.updated_at || item.created_at);
  const age = Number.isNaN(updatedAt.getTime()) ? 999 : daysSince(updatedAt);
  const recencyScore = age <= 14 ? 10 : age <= 45 ? 7 : age <= 120 ? 3 : 0;
  const penalty = intentPenalty(title, repository, flags);

  return clamp(queryTitleScore + originalTextScore + repoScore + engagementScore + recencyScore - penalty, 0, 100);
}

export function classifyGitHubIssue(item: GitHubIssueItem): GitHubIssueClassification {
  const title = stripHtmlTags(item.title);
  const labels = labelNames(item);
  const authorAssociation = item.author_association ? item.author_association.toUpperCase() : null;
  const officialRepoCandidate = Boolean(authorAssociation && OFFICIAL_AUTHOR_ASSOCIATIONS.has(authorAssociation));
  const signalType = classifyByGitHubLabels(title, labels);
  const riskLevel = classifyRisk(title, signalType);
  const verificationStatus = classifyVerification(authorAssociation, riskLevel);

  return {
    signalType,
    riskLevel,
    verificationStatus,
    officialRepoCandidate,
  };
}

export function normalizeGitHubIssue(
  item: GitHubIssueItem,
  candidateId: string,
  context: GitHubIssueNormalizationContext,
): NormalizedGitHubIssueSignal | null {
  if (item.pull_request || !item.title || !item.html_url) return null;

  const repository = repositoryFromUrl(item.repository_url);
  const title = stripHtmlTags(item.title);
  const labels = labelNames(item);
  const classification = classifyGitHubIssue(item);
  const updatedAt = new Date(item.updated_at || item.created_at);
  const createdAt = new Date(item.created_at);
  const publishedAt = Number.isNaN(updatedAt.getTime()) ? null : updatedAt;
  const reactionCount = Math.max(0, item.reactions?.total_count ?? 0);
  const commentCount = Math.max(0, item.comments ?? 0);
  const externalId = `${repository}#${item.number}`;
  const relevanceScore = calculateGitHubIssueRelevance(item, repository, context);
  const matchedQueries = context.matchedQueries.map((query) => query.searchTerm);
  const meta: GitHubIssueSignalMeta = {
    repository,
    repositoryUrl: item.repository_url,
    githubIssueId: item.id,
    nodeId: item.node_id ?? null,
    issueNumber: item.number,
    htmlUrl: item.html_url,
    labels,
    authorAssociation: item.author_association ?? null,
    createdAt: Number.isNaN(createdAt.getTime()) ? item.created_at : createdAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime()) ? item.updated_at : updatedAt.toISOString(),
    comments: commentCount,
    reactionsTotalCount: reactionCount,
    externalId,
    searchQuery: matchedQueries[0] ?? null,
    matchedQueries,
    relevanceScore,
    officialRepoCandidate: classification.officialRepoCandidate,
    metadataOnly: true,
  };

  return {
    candidateId,
    sourceType: GITHUB_ISSUES_SOURCE_TYPE,
    sourceName: `${GITHUB_ISSUES_SOURCE_NAME}: ${repository}`,
    externalId,
    canonicalUrl: item.html_url,
    title,
    url: item.html_url,
    publishedAt,
    score: commentCount + reactionCount + Math.round(relevanceScore / 5),
    commentCount,
    reactionCount,
    summary: summarizeSignal(
      `${repository}#${item.number} relevance=${relevanceScore}, query=${matchedQueries[0] ?? "-"}, comments=${commentCount}, reactions=${reactionCount}, labels=${labels.join(", ") || "-"}`,
      GITHUB_ISSUES_SOURCE_NAME,
    ),
    signalType: classification.signalType,
    riskLevel: classification.riskLevel,
    verificationStatus: classification.verificationStatus,
    confidence: relevanceScore >= 25 ? "medium" : "low",
    rawMetaJson: JSON.stringify(meta),
    linksJson: JSON.stringify([{ title, url: item.html_url, repository, updatedAt: item.updated_at }]),
    importMethod: "github_search_api",
  };
}
