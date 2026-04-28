import {
  failedTrendResult,
  type TrendCollector,
  type TrendCollectorResult,
} from "@/lib/trend/collectors/base-trend-collector";
import {
  clamp,
  daysAgo,
  getNaverHeaders,
  summarizeError,
  toIsoDate,
} from "@/lib/trend/collectors/naver-utils";
import type { NaverCredentials } from "@/lib/trend/naver-config";

type NaverDataLabResponse = {
  results?: Array<{
    title: string;
    keywords: string[];
    data: Array<{
      period: string;
      ratio: number;
    }>;
  }>;
};

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreGrowth(growthRate: number, recentAverage: number) {
  const base = recentAverage > 0 ? 12 : 0;
  const growthBoost = clamp(Math.round(growthRate * 28), -10, 18);
  const volumeBoost = clamp(Math.round(recentAverage / 8), 0, 6);
  return clamp(base + growthBoost + volumeBoost, 0, 30);
}

function confidenceFromGrowth(score: number, dataCount: number) {
  if (dataCount >= 60 && score >= 24) return "high";
  if (dataCount >= 20 && score >= 14) return "medium";
  return "low";
}

export class NaverDataLabCollector implements TrendCollector {
  readonly source = "naver_datalab" as const;

  constructor(private readonly credentials: NaverCredentials) {}

  async collect(keyword: string): Promise<TrendCollectorResult> {
    const [result] = await this.collectMany([keyword]);
    return result;
  }

  async collectMany(keywords: string[]): Promise<TrendCollectorResult[]> {
    const uniqueKeywords = Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 5);

    if (uniqueKeywords.length === 0) {
      return [];
    }

    try {
      const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
        method: "POST",
        headers: {
          ...getNaverHeaders(this.credentials),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: toIsoDate(daysAgo(89)),
          endDate: toIsoDate(new Date()),
          timeUnit: "date",
          keywordGroups: uniqueKeywords.map((keyword) => ({
            groupName: keyword,
            keywords: [keyword],
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Naver DataLab API failed: ${response.status}`);
      }

      const payload = (await response.json()) as NaverDataLabResponse;
      const resultMap = new Map((payload.results ?? []).map((result) => [result.title, result]));

      return uniqueKeywords.map((keyword) => {
        const item = resultMap.get(keyword);
        const ratios = item?.data.map((point) => Number(point.ratio) || 0) ?? [];
        const recent7Average = average(ratios.slice(-7));
        const previous23Average = average(ratios.slice(-30, -7));
        const recent30Average = average(ratios.slice(-30));
        const previous60Average = average(ratios.slice(0, -30));
        const growthRate =
          previous23Average > 0 ? (recent7Average - previous23Average) / previous23Average : recent7Average > 0 ? 1 : 0;
        const ninetyDayGrowthRate =
          previous60Average > 0 ? (recent30Average - previous60Average) / previous60Average : recent30Average > 0 ? 1 : 0;
        const score = scoreGrowth(growthRate, recent7Average);
        const confidence = confidenceFromGrowth(score, ratios.length);

        return {
          keyword,
          source: this.source,
          period: "90d",
          score,
          confidence,
          status: "success" as const,
          rawSummary: JSON.stringify({
            summary: "네이버 데이터랩 통합검색어 추이",
            period: "90d",
            recentAverage: Number(recent7Average.toFixed(2)),
            previousAverage: Number(previous23Average.toFixed(2)),
            growthRate: Number(growthRate.toFixed(4)),
            ninetyDayGrowthRate: Number(ninetyDayGrowthRate.toFixed(4)),
            dataPoints: ratios.length,
          }),
          links: [],
          metrics: {
            recent7Average: Number(recent7Average.toFixed(2)),
            previous23Average: Number(previous23Average.toFixed(2)),
            recent30Average: Number(recent30Average.toFixed(2)),
            previous60Average: Number(previous60Average.toFixed(2)),
            growthRate: Number(growthRate.toFixed(4)),
            ninetyDayGrowthRate: Number(ninetyDayGrowthRate.toFixed(4)),
            dataPoints: ratios.length,
          },
        };
      });
    } catch (error) {
      const errorMessage = summarizeError(error);
      return uniqueKeywords.map((keyword) =>
        failedTrendResult({
          keyword,
          source: this.source,
          period: "90d",
          errorMessage,
        }),
      );
    }
  }
}
