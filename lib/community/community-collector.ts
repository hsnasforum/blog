import type { CommunityCollectResult } from "@/lib/community/community-types";

export type CommunityCandidateInput = {
  id: string;
  keyword: string;
  optionalKeywords?: string[];
  sourceTitles?: string[];
};

export interface CommunityCollector {
  readonly sourceType: string;
  collect(candidate: CommunityCandidateInput): Promise<CommunityCollectResult>;
}

export function emptyCommunityCollectResult(
  candidateId: string,
  warning?: string,
): CommunityCollectResult {
  return {
    candidateId,
    signals: [],
    warnings: warning ? [warning] : [],
  };
}
