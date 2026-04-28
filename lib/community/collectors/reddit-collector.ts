import { env } from "@/lib/env";
import {
  type CommunityCandidateInput,
  type CommunityCollector,
  emptyCommunityCollectResult,
} from "@/lib/community/community-collector";
import type { CommunityCollectResult, CommunitySignalInput } from "@/lib/community/community-types";
import { classifySignalType, stripHtmlTags, summarizeError, summarizeSignal } from "@/lib/community/community-utils";

type RedditChild = {
  data?: {
    title?: string;
    permalink?: string;
    url?: string;
    created_utc?: number;
    score?: number;
    num_comments?: number;
    subreddit_name_prefixed?: string;
  };
};

type RedditSearchResponse = {
  data?: {
    children?: RedditChild[];
  };
};

function subredditWhitelist() {
  return (env.REDDIT_SUBREDDIT_WHITELIST ?? "")
    .split(",")
    .map((subreddit) => subreddit.trim().replace(/^r\//i, ""))
    .filter(Boolean)
    .slice(0, 5);
}

export class RedditCollector implements CommunityCollector {
  readonly sourceType = "reddit";

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    if (!env.REDDIT_BEARER_TOKEN) {
      return emptyCommunityCollectResult(candidate.id, "REDDIT_BEARER_TOKEN이 없어 Reddit 공식 API 수집을 건너뜁니다.");
    }

    const subreddits = subredditWhitelist();
    if (subreddits.length === 0) {
      return emptyCommunityCollectResult(candidate.id, "REDDIT_SUBREDDIT_WHITELIST가 없어 Reddit 수집을 건너뜁니다.");
    }

    try {
      const signals: CommunitySignalInput[] = [];

      for (const subreddit of subreddits) {
        const url = new URL(`https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/search`);
        url.searchParams.set("q", candidate.keyword);
        url.searchParams.set("restrict_sr", "1");
        url.searchParams.set("sort", "new");
        url.searchParams.set("t", "month");
        url.searchParams.set("limit", "5");
        url.searchParams.set("raw_json", "1");

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${env.REDDIT_BEARER_TOKEN}`,
            "User-Agent": "local-blog-writer-mvp/0.1",
          },
        });

        if (!response.ok) {
          throw new Error(`Reddit API search failed: ${response.status}`);
        }

        const payload = (await response.json()) as RedditSearchResponse;
        for (const child of payload.data?.children ?? []) {
          const data = child.data;
          const title = stripHtmlTags(data?.title ?? "");
          if (!data || !title) continue;
          const publishedAt = data.created_utc ? new Date(data.created_utc * 1000) : null;
          signals.push({
            candidateId: candidate.id,
            sourceType: "reddit",
            sourceName: data.subreddit_name_prefixed ?? `r/${subreddit}`,
            title,
            url: data.permalink ? `https://www.reddit.com${data.permalink}` : data.url ?? `https://www.reddit.com/r/${subreddit}`,
            publishedAt,
            score: Math.max(0, data.score ?? 0),
            commentCount: Math.max(0, data.num_comments ?? 0),
            reactionCount: Math.max(0, data.score ?? 0),
            summary: summarizeSignal(title, data.subreddit_name_prefixed ?? `r/${subreddit}`),
            signalType: classifySignalType(title),
          });
        }
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
