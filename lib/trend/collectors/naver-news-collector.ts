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

type NaverNewsItem = {
  title: string;
  originallink?: string;
  link: string;
  pubDate: string;
};

type NaverNewsResponse = {
  items?: NaverNewsItem[];
};

function normalizeTitle(title: string) {
  return stripHtmlTags(title).toLowerCase().replace(/\s+/g, "");
}

function parsePubDate(raw: string) {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scoreNewsVelocity(params: {
  recent7Count: number;
  recent30Count: number;
  latestAgeDays: number | null;
  duplicateRatio: number;
}) {
  const latestBoost =
    params.latestAgeDays === null ? 0 : params.latestAgeDays <= 2 ? 5 : params.latestAgeDays <= 7 ? 3 : 0;
  const duplicatePenalty = params.duplicateRatio >= 0.45 ? 4 : params.duplicateRatio >= 0.25 ? 2 : 0;
  return clamp(params.recent7Count * 3 + Math.round(params.recent30Count * 0.5) + latestBoost - duplicatePenalty, 0, 20);
}

export class NaverNewsCollector implements TrendCollector {
  readonly source = "naver_news" as const;

  constructor(private readonly credentials: NaverCredentials) {}

  async collect(keyword: string): Promise<TrendCollectorResult> {
    try {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "20");
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "date");

      const response = await fetch(url, {
        headers: getNaverHeaders(this.credentials),
      });

      if (!response.ok) {
        throw new Error(`Naver News API failed: ${response.status}`);
      }

      const payload = (await response.json()) as NaverNewsResponse;
      const items = payload.items ?? [];
      const parsedItems = items
        .map((item) => {
          const pubDate = parsePubDate(item.pubDate);
          return {
            title: stripHtmlTags(item.title),
            link: item.originallink || item.link,
            pubDate,
          };
        })
        .filter((item) => item.title && item.link);
      const recent7Count = parsedItems.filter((item) => item.pubDate && daysSince(item.pubDate) <= 7).length;
      const recent30Count = parsedItems.filter((item) => item.pubDate && daysSince(item.pubDate) <= 30).length;
      const latestAgeDays = parsedItems[0]?.pubDate ? daysSince(parsedItems[0].pubDate) : null;
      const uniqueTitleCount = new Set(parsedItems.map((item) => normalizeTitle(item.title))).size;
      const duplicateRatio = parsedItems.length > 0 ? 1 - uniqueTitleCount / parsedItems.length : 0;
      const score = scoreNewsVelocity({ recent7Count, recent30Count, latestAgeDays, duplicateRatio });
      const confidence = recent30Count >= 8 && duplicateRatio < 0.35 ? "high" : recent30Count >= 3 ? "medium" : "low";
      const links: TrendSignalLink[] = parsedItems.slice(0, 3).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate?.toISOString(),
      }));

      return {
        keyword,
        source: this.source,
        period: "30d",
        score,
        confidence,
        status: "success",
        rawSummary: JSON.stringify({
          summary: "네이버 뉴스 최신순 검색 신호",
          recent7Count,
          recent30Count,
          latestAgeDays,
          duplicateRatio: Number(duplicateRatio.toFixed(3)),
        }),
        links,
        metrics: {
          recent7Count,
          recent30Count,
          latestAgeDays,
          duplicateRatio: Number(duplicateRatio.toFixed(3)),
          uniqueTitleCount,
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
