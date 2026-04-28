export type TrendSignalSource = "naver_datalab" | "naver_news" | "naver_blog";
export type TrendSignalConfidence = "low" | "medium" | "high";
export type TrendSignalStatus = "success" | "failed";

export type TrendSignalLink = {
  title: string;
  link: string;
  pubDate?: string;
};

export type TrendCollectorResult = {
  keyword: string;
  source: TrendSignalSource;
  period: string;
  score: number;
  confidence: TrendSignalConfidence;
  status: TrendSignalStatus;
  rawSummary: string;
  links: TrendSignalLink[];
  metrics: Record<string, number | string | boolean | null>;
  errorMessage?: string;
};

export interface TrendCollector {
  readonly source: TrendSignalSource;
  collect(keyword: string): Promise<TrendCollectorResult>;
}

export function failedTrendResult(params: {
  keyword: string;
  source: TrendSignalSource;
  period: string;
  errorMessage: string;
}): TrendCollectorResult {
  return {
    keyword: params.keyword,
    source: params.source,
    period: params.period,
    score: 0,
    confidence: "low",
    status: "failed",
    rawSummary: JSON.stringify({
      summary: "외부 데이터 수집 실패",
      errorMessage: params.errorMessage,
    }),
    links: [],
    metrics: {},
    errorMessage: params.errorMessage,
  };
}
