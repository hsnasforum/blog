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
  unixSeconds,
} from "@/lib/community/community-utils";

type HackerNewsHit = {
  title?: string;
  url?: string;
  objectID?: string;
  points?: number;
  num_comments?: number;
  created_at?: string;
};

type HackerNewsResponse = {
  hits?: HackerNewsHit[];
};

export class HackerNewsCollector implements CommunityCollector {
  readonly sourceType = "hacker_news";

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    try {
      const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
      url.searchParams.set("query", candidate.keyword);
      url.searchParams.set("tags", "story");
      url.searchParams.set("hitsPerPage", "10");
      url.searchParams.set("numericFilters", `created_at_i>${unixSeconds(daysAgo(30))}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Hacker News search failed: ${response.status}`);
      }

      const payload = (await response.json()) as HackerNewsResponse;
      const signals: CommunitySignalInput[] = [];

      for (const hit of payload.hits ?? []) {
        const title = stripHtmlTags(hit.title ?? "");
        if (!title) continue;
        const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID ?? ""}`;
        const createdAt = hit.created_at ? new Date(hit.created_at) : null;
        const score = Math.max(0, Math.round(hit.points ?? 0));
        const commentCount = Math.max(0, Math.round(hit.num_comments ?? 0));

        signals.push({
          candidateId: candidate.id,
          sourceType: "hacker_news",
          sourceName: "Hacker News",
          title,
          url: hit.url || hnUrl,
          publishedAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
          score,
          commentCount,
          reactionCount: score,
          summary: summarizeSignal(title, "Hacker News"),
          signalType: classifySignalType(title),
        });
      }

      return {
        candidateId: candidate.id,
        signals: signals.slice(0, 5),
        warnings: [],
      };
    } catch (error) {
      return emptyCommunityCollectResult(candidate.id, summarizeError(error));
    }
  }
}
