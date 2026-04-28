import type {
  CommunityCandidateInput,
  CommunityCollector,
} from "@/lib/community/community-collector";
import type { CommunityCollectResult, CommunitySourceType } from "@/lib/community/community-types";

export class MockCommunityCollector implements CommunityCollector {
  constructor(readonly sourceType: CommunitySourceType, private readonly sourceName: string) {}

  async collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult> {
    return {
      candidateId: candidate.id,
      warnings: [],
      signals: [
        {
          candidateId: candidate.id,
          sourceType: this.sourceType,
          sourceName: this.sourceName,
          title: `${candidate.keyword} 관련 설정 실패와 선택 기준 논의`,
          url: `https://example.com/${this.sourceType}/${encodeURIComponent(candidate.keyword)}`,
          publishedAt: new Date(),
          score: 42,
          commentCount: 18,
          reactionCount: 24,
          summary: `${this.sourceName}에서 확인된 공개 반응 요약`,
          signalType: "operational_issue",
        },
      ],
    };
  }
}
