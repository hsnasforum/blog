import type {
  CommunityRiskLevel,
  CommunitySignalInput,
  CommunitySignalType,
  CommunityVerificationStatus,
} from "@/lib/community/community-types";

export const GITHUB_ISSUES_SOURCE_TYPE = "github_issues" as const;
export const GITHUB_ISSUES_SOURCE_NAME = "GitHub Issues";
export const GITHUB_ISSUES_API_URL = "https://api.github.com/search/issues";
export const GITHUB_ISSUES_COLLECTOR_MODEL = "github-search-issues";
export const GITHUB_ISSUES_MAX_TERMS = 4;
export const GITHUB_ISSUES_PER_PAGE = 10;
export const GITHUB_ISSUES_SIGNAL_LIMIT = 5;
export const GITHUB_ISSUES_WINDOW_DAYS = 45;
export const GITHUB_ISSUES_MAX_QUERIES = 12;
export const GITHUB_ISSUES_MIN_RELEVANCE_SCORE = 8;
export const GITHUB_ISSUES_SEARCH_FACETS = [
  "bug",
  "regression",
  "breaking change",
  "pricing",
  "billing",
  "api",
  "documentation",
] as const;

export type GitHubIssueLabel = {
  name?: string | null;
};

export type GitHubIssueItem = {
  id: number;
  node_id?: string;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  author_association?: string | null;
  labels?: GitHubIssueLabel[];
  reactions?: {
    total_count?: number;
  };
  pull_request?: unknown;
};

export type GitHubIssueSearchResponse = {
  items?: GitHubIssueItem[];
};

export type GitHubIssueSearchQuery = {
  query: string;
  searchTerm: string;
  facet?: string;
  isMapped: boolean;
};

export type GitHubIssueSearchHit = {
  item: GitHubIssueItem;
  matchedQueries: GitHubIssueSearchQuery[];
};

export type GitHubIssueNormalizationContext = {
  originalTexts: string[];
  searchQueries: GitHubIssueSearchQuery[];
  matchedQueries: GitHubIssueSearchQuery[];
};

export type GitHubIssueSignalMeta = {
  repository: string;
  repositoryUrl: string;
  githubIssueId: number;
  nodeId: string | null;
  issueNumber: number;
  htmlUrl: string;
  labels: string[];
  authorAssociation: string | null;
  createdAt: string;
  updatedAt: string;
  comments: number;
  reactionsTotalCount: number;
  externalId: string;
  searchQuery: string | null;
  matchedQueries: string[];
  relevanceScore: number;
  officialRepoCandidate: boolean;
  metadataOnly: true;
};

export type NormalizedGitHubIssueSignal = CommunitySignalInput & {
  sourceType: typeof GITHUB_ISSUES_SOURCE_TYPE;
  rawMetaJson: string;
};

export type GitHubIssueClassification = {
  signalType: CommunitySignalType;
  riskLevel: CommunityRiskLevel;
  verificationStatus: CommunityVerificationStatus;
  officialRepoCandidate: boolean;
};
