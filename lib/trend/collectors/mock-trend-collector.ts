import type {
  TrendCollector,
  TrendCollectorResult,
  TrendSignalSource,
} from "@/lib/trend/collectors/base-trend-collector";

function mockLink(keyword: string, source: TrendSignalSource, index: number) {
  return {
    title: `${keyword} ${source} 참고 링크 ${index}`,
    link: `https://example.com/${source}/${encodeURIComponent(keyword)}/${index}`,
    pubDate: new Date(Date.now() - index * 86_400_000).toISOString(),
  };
}

export class MockTrendCollector implements TrendCollector {
  constructor(readonly source: TrendSignalSource) {}

  async collect(keyword: string): Promise<TrendCollectorResult> {
    const sourceScore = this.source === "naver_datalab" ? 28 : this.source === "naver_news" ? 19 : 18;

    return {
      keyword,
      source: this.source,
      period: this.source === "naver_datalab" ? "90d" : "30d",
      score: sourceScore,
      confidence: "high",
      status: "success",
      rawSummary: JSON.stringify({
        summary: "mock collector success",
        recent7Count: 8,
        recent30Count: 20,
        growthRate: 0.72,
      }),
      links: [mockLink(keyword, this.source, 1), mockLink(keyword, this.source, 2), mockLink(keyword, this.source, 3)],
      metrics: {
        recent7Count: 8,
        recent30Count: 20,
        growthRate: 0.72,
      },
    };
  }
}
