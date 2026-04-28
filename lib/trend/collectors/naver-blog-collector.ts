import {
  failedTrendResult,
  type TrendCollector,
  type TrendCollectorResult,
  type TrendSignalLink,
} from "@/lib/trend/collectors/base-trend-collector";
import {
  clamp,
  daysSince,
  getNaverHeaders,
  stripHtmlTags,
  summarizeError,
} from "@/lib/trend/collectors/naver-utils";
import type { NaverCredentials } from "@/lib/trend/naver-config";

type NaverBlogItem = {
  title: string;
  link: string;
  postdate: string;
};

type NaverBlogResponse = {
  items?: NaverBlogItem[];
};

const reviewLikeTerms = [
  "후기",
  "사용기",
  "써보니",
  "직접",
  "경험",
  "비교",
  "선택",
  "문제",
  "실패",
  "장단점",
  "체크",
];

function parsePostDate(raw: string) {
  if (!/^\d{8}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasReviewLikeTerm(title: string) {
  return reviewLikeTerms.some((term) => title.includes(term));
}

function scoreBlogBuzz(params: {
  recent7Count: number;
  recent30Count: number;
  reviewLikeCount: number;
}) {
  return clamp(params.recent7Count * 2 + Math.round(params.recent30Count * 0.4) + params.reviewLikeCount * 2, 0, 20);
}

export class NaverBlogCollector implements TrendCollector {
  readonly source = "naver_blog" as const;

  constructor(private readonly credentials: NaverCredentials) {}

  async collect(keyword: string): Promise<TrendCollectorResult> {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/blog.json");
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "20");
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "date");

      const response = await fetch(url, {
        headers: getNaverHeaders(this.credentials),
      });

      if (!response.ok) {
        throw new Error(`Naver Blog API failed: ${response.status}`);
      }

      const payload = (await response.json()) as NaverBlogResponse;
      const parsedItems = (payload.items ?? [])
        .map((item) => ({
          title: stripHtmlTags(item.title),
          link: item.link,
          postDate: parsePostDate(item.postdate),
        }))
        .filter((item) => item.title && item.link);
      const recent7Count = parsedItems.filter((item) => item.postDate && daysSince(item.postDate) <= 7).length;
      const recent30Count = parsedItems.filter((item) => item.postDate && daysSince(item.postDate) <= 30).length;
      const reviewLikeCount = parsedItems.filter((item) => hasReviewLikeTerm(item.title)).length;
      const score = scoreBlogBuzz({ recent7Count, recent30Count, reviewLikeCount });
      const confidence = recent30Count >= 8 ? "high" : recent30Count >= 3 || reviewLikeCount >= 2 ? "medium" : "low";
      const links: TrendSignalLink[] = parsedItems.slice(0, 3).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.postDate?.toISOString(),
      }));

      return {
        keyword,
        source: this.source,
        period: "30d",
        score,
        confidence,
        status: "success",
        rawSummary: JSON.stringify({
          summary: "네이버 블로그 최신순 검색 신호",
          recent7Count,
          recent30Count,
          reviewLikeCount,
        }),
        links,
        metrics: {
          recent7Count,
          recent30Count,
          reviewLikeCount,
        },
      };
    } catch (error) {
      return failedTrendResult({
        keyword,
        source: this.source,
        period: "30d",
        errorMessage: summarizeError(error),
      });
    }
  }
}
