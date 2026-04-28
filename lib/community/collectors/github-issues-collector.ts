import { env } from "@/lib/env";
import {
  type CommunityCandidateInput,
  type CommunityCollector,
  emptyCommunityCollectResult,
} from "@/lib/community/community-collector";
import type { CommunityCollectResult, CommunitySignalInput } from "@/lib/community/community-types";
import {
  classifySignalType,
  daysAgo,
  stripHtmlTags,
  summarizeError,
  summarizeSignal,
} from "@/lib/community/community-utils";

type GitHubIssueItem = {
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  reactions?: {
    total_count?: number;
  };
};

type GitHubSearchResponse = {
  items?: GitHubIssueItem[];
};

export class GitHubIssuesCollector implements CommunityCollector {
  readonly sourceType = "github_issues";

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    try {
      const fromDate = daysAgo(30).toISOString().slice(0, 10);
      const url = new URL("https://api.github.com/search/issues");
      url.searchParams.set(
        "q",
        `${candidate.keyword} is:issue updated:>=${fromDate} bug OR regression OR breaking OR error OR discussion`,
      );
      url.searchParams.set("sort", "comments");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", "10");

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`GitHub issues search failed: ${response.status}`);
      }

      const payload = (await response.json()) as GitHubSearchResponse;
      const signals: CommunitySignalInput[] = (payload.items ?? [])
        .map((item) => {
          const title = stripHtmlTags(item.title);
          const publishedAt = new Date(item.updated_at || item.created_at);

          return {
            candidateId: candidate.id,
            sourceType: "github_issues" as const,
            sourceName: "GitHub Issues",
            title,
            url: item.html_url,
            publishedAt: Number.isNaN(publishedAt.getTime()) ? null : publishedAt,
            score: Math.max(0, item.comments + (item.reactions?.total_count ?? 0)),
            commentCount: Math.max(0, item.comments),
            reactionCount: Math.max(0, item.reactions?.total_count ?? 0),
            summary: summarizeSignal(title, "GitHub Issues"),
            signalType: classifySignalType(title),
          };
        })
        .slice(0, 5);

      return {
        candidateId: candidate.id,
        signals,
        warnings: [],
      };
    } catch (error) {
      return emptyCommunityCollectResult(candidate.id, summarizeError(error));
    }
  }
}
