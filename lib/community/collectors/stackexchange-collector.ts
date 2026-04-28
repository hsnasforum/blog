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
  unixSeconds,
} from "@/lib/community/community-utils";

type StackExchangeItem = {
  title: string;
  link: string;
  score: number;
  answer_count: number;
  creation_date?: number;
  last_activity_date?: number;
};

type StackExchangeResponse = {
  items?: StackExchangeItem[];
};

export class StackExchangeCollector implements CommunityCollector {
  readonly sourceType = "stackexchange";

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    try {
      const url = new URL("https://api.stackexchange.com/2.3/search/advanced");
      url.searchParams.set("order", "desc");
      url.searchParams.set("sort", "activity");
      url.searchParams.set("q", candidate.keyword);
      url.searchParams.set("site", env.STACKEXCHANGE_SITE);
      url.searchParams.set("pagesize", "10");
      url.searchParams.set("fromdate", String(unixSeconds(daysAgo(30))));
      if (env.STACK_EXCHANGE_KEY) {
        url.searchParams.set("key", env.STACK_EXCHANGE_KEY);
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Stack Exchange search failed: ${response.status}`);
      }

      const payload = (await response.json()) as StackExchangeResponse;
      const signals: CommunitySignalInput[] = (payload.items ?? [])
        .map((item) => {
          const title = stripHtmlTags(item.title);
          const activity = item.last_activity_date ?? item.creation_date;

          return {
            candidateId: candidate.id,
            sourceType: "stackexchange" as const,
            sourceName: "Stack Exchange",
            title,
            url: item.link,
            publishedAt: activity ? new Date(activity * 1000) : null,
            score: Math.max(0, item.score),
            commentCount: Math.max(0, item.answer_count),
            reactionCount: Math.max(0, item.score),
            summary: summarizeSignal(title, "Stack Exchange"),
            signalType: item.answer_count === 0 ? "beginner_confusion" : classifySignalType(title),
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
