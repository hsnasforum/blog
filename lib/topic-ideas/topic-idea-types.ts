export type TopicIdea = {
  title: string;
  rawTopic: string;
  memo: string;
  optionalKeywords: string;
  avoidTopics: string;
  reason: string;
  targetAudience: string;
  estimatedVerdict: "review_first" | "hold" | "reject";
  riskLevel: "low" | "medium" | "high";
  verificationStatus: "community_only" | "needs_manual_review" | "official_confirmed";
  suggestedAngle: string;
  sourceHints: string[];
};
