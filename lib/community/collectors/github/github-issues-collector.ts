import { env } from "@/lib/env";
import {
  type CommunityCandidateInput,
  type CommunityCollector,
  emptyCommunityCollectResult,
} from "@/lib/community/community-collector";
import type { CommunityCollectResult, CommunitySignalInput } from "@/lib/community/community-types";
import {
  daysAgo,
  summarizeError,
} from "@/lib/community/community-utils";
import { compactQueryText, extractAsciiPhrases, pushUnique } from "@/lib/community/query-mapper";
import { mapCommunityTitleToGitHubQueries } from "@/lib/community/github-query-mapper";
import {
  GITHUB_ISSUES_API_URL,
  GITHUB_ISSUES_MIN_RELEVANCE_SCORE,
  GITHUB_ISSUES_MAX_QUERIES,
  GITHUB_ISSUES_MAX_TERMS,
  GITHUB_ISSUES_PER_PAGE,
  GITHUB_ISSUES_SEARCH_FACETS,
  GITHUB_ISSUES_SIGNAL_LIMIT,
  GITHUB_ISSUES_WINDOW_DAYS,
  type GitHubIssueNormalizationContext,
  type GitHubIssueSearchHit,
  type GitHubIssueSearchQuery,
  type GitHubIssueSearchResponse,
} from "@/lib/community/collectors/github/github-types";
import { normalizeGitHubIssue } from "@/lib/community/collectors/github/github-issue-normalizer";
import { MOCK_GITHUB_ISSUES } from "@/lib/community/collectors/github/github-mock-issues";

const GITHUB_TOKEN_MISSING_WARNING =
  "GITHUB_TOKEN이 없어 unauthenticated GitHub Search API rate limit을 사용합니다.";

function isMockMode() {
  return process.env.GITHUB_ISSUES_COLLECTOR_MODE === "mock";
}

function isMockEmptyMode() {
  return process.env.GITHUB_ISSUES_COLLECTOR_MODE === "mock-empty";
}

function shouldReturnEmptyMock(candidate: CommunityCandidateInput) {
  return isMockEmptyMode() || (isMockMode() && candidate.keyword.includes("결과 없음 케이스"));
}

function splitOptionalKeywords(keywords: string[] | undefined) {
  return (keywords ?? [])
    .flatMap((value) => value.split(","))
    .map(compactQueryText)
    .filter(Boolean);
}

function candidateTexts(candidate: CommunityCandidateInput) {
  return [
    candidate.keyword,
    ...splitOptionalKeywords(candidate.optionalKeywords),
    ...(candidate.sourceTitles ?? []),
  ]
    .map(compactQueryText)
    .filter(Boolean);
}

function buildSearchTerms(candidate: CommunityCandidateInput) {
  const terms: string[] = [];

  for (const value of candidateTexts(candidate)) {
    const mapped = mapCommunityTitleToGitHubQueries(value);
    for (const query of mapped.queries) pushUnique(terms, query);
    for (const phrase of extractAsciiPhrases(value)) pushUnique(terms, phrase);
    pushUnique(terms, value);
  }

  return terms.slice(0, GITHUB_ISSUES_MAX_TERMS);
}

export function buildGitHubIssueSearchQueries(candidate: CommunityCandidateInput) {
  const fromDate = daysAgo(GITHUB_ISSUES_WINDOW_DAYS).toISOString().slice(0, 10);
  const terms = buildSearchTerms(candidate);
  const queries: GitHubIssueSearchQuery[] = [];

  for (const term of terms) {
    queries.push({
      query: `"${term}" is:issue updated:>=${fromDate}`,
      searchTerm: term,
      isMapped: mapCommunityTitleToGitHubQueries(term).matchedAliases.length > 0 || term !== compactQueryText(term),
    });
  }

  for (const term of terms.slice(0, 2)) {
    for (const facet of GITHUB_ISSUES_SEARCH_FACETS) {
      queries.push({
        query: `"${term}" "${facet}" is:issue updated:>=${fromDate}`,
        searchTerm: term,
        facet,
        isMapped: true,
      });
      if (queries.length >= GITHUB_ISSUES_MAX_QUERIES) return queries;
    }
  }

  return queries.slice(0, GITHUB_ISSUES_MAX_QUERIES);
}

function buildSearchUrl(query: GitHubIssueSearchQuery) {
  const url = new URL(GITHUB_ISSUES_API_URL);
  url.searchParams.set("q", query.query);
  url.searchParams.set("sort", "comments");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(GITHUB_ISSUES_PER_PAGE));
  return url;
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function searchIssues(query: GitHubIssueSearchQuery): Promise<GitHubIssueSearchHit[]> {
  const response = await fetch(buildSearchUrl(query), { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub issues search failed: ${response.status}`);
  }

  const payload = (await response.json()) as GitHubIssueSearchResponse;
  return (payload.items ?? []).map((item) => ({ item, matchedQueries: [query] }));
}

function mockIssueHits(queries: GitHubIssueSearchQuery[]) {
  return MOCK_GITHUB_ISSUES.flatMap((item) =>
    queries.slice(0, 4).map((query) => ({
      item,
      matchedQueries: [query],
    })),
  );
}

function dedupeGitHubIssueHits(hits: GitHubIssueSearchHit[]) {
  const seen = new Map<string, GitHubIssueSearchHit>();

  for (const hit of hits) {
    const key = hit.item.html_url || String(hit.item.id);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { item: hit.item, matchedQueries: [...hit.matchedQueries] });
      continue;
    }

    for (const query of hit.matchedQueries) {
      const exists = existing.matchedQueries.some(
        (item) => item.query === query.query && item.searchTerm === query.searchTerm && item.facet === query.facet,
      );
      if (!exists) existing.matchedQueries.push(query);
    }
  }

  return Array.from(seen.values());
}

export class GitHubIssuesCollector implements CommunityCollector {
  readonly sourceType = "github_issues";

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    const warnings = env.GITHUB_TOKEN ? [] : [GITHUB_TOKEN_MISSING_WARNING];

    try {
      const queries = buildGitHubIssueSearchQueries(candidate);
      if (queries.length === 0) {
        return emptyCommunityCollectResult(candidate.id, "GitHub Issues 검색어를 만들 수 없습니다.");
      }

      const originalTexts = candidateTexts(candidate);
      const hits = dedupeGitHubIssueHits(
        shouldReturnEmptyMock(candidate)
          ? []
          : isMockMode()
            ? mockIssueHits(queries)
            : (await Promise.all(queries.map(searchIssues))).flat(),
      );
      const seen = new Set<string>();
      const signals: CommunitySignalInput[] = [];

      for (const hit of hits) {
        const context: GitHubIssueNormalizationContext = {
          originalTexts,
          searchQueries: queries,
          matchedQueries: hit.matchedQueries,
        };
        const normalized = normalizeGitHubIssue(hit.item, candidate.id, context);
        if (!normalized) continue;
        const meta = normalized.rawMetaJson ? (JSON.parse(normalized.rawMetaJson) as { relevanceScore?: number }) : {};
        if ((meta.relevanceScore ?? 0) < GITHUB_ISSUES_MIN_RELEVANCE_SCORE) {
          normalized.confidence = "low";
        }
        const dedupeKey = normalized.externalId ?? normalized.url;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        signals.push(normalized);
        if (signals.length >= GITHUB_ISSUES_SIGNAL_LIMIT) break;
      }

      return {
        candidateId: candidate.id,
        signals,
        warnings,
      };
    } catch (error) {
      return emptyCommunityCollectResult(candidate.id, summarizeError(error));
    }
  }
}
