import type { WorkflowRunType } from "@/lib/auto-workflow/auto-workflow-types";

export type WorkflowRunStepDefinition = {
  stepKey: string;
  stepLabel: string;
  progressWeight: number;
};

export const workflowRunStepDefinitions: Record<WorkflowRunType, WorkflowRunStepDefinition[]> = {
  auto_scout: [
    { stepKey: "load_topic", stepLabel: "Topic 확인 중", progressWeight: 5 },
    { stepKey: "generate_candidates", stepLabel: "후보 생성 중", progressWeight: 25 },
    { stepKey: "score_candidates", stepLabel: "점수 계산 중", progressWeight: 45 },
    { stepKey: "collect_trend_signals", stepLabel: "외부 트렌드 신호 수집 중", progressWeight: 65 },
    { stepKey: "collect_community_signals", stepLabel: "커뮤니티 신호 반영 중", progressWeight: 80 },
    { stepKey: "boost_github_issues", stepLabel: "GitHub Issues 보강 중", progressWeight: 92 },
    { stepKey: "finalize_scout", stepLabel: "후보 정렬 중", progressWeight: 100 },
  ],
  auto_draft: [
    { stepKey: "load_candidate", stepLabel: "후보 확인 중", progressWeight: 5 },
    { stepKey: "create_post", stepLabel: "Post 생성 중", progressWeight: 10 },
    { stepKey: "generate_angle", stepLabel: "글 방향 생성 중", progressWeight: 20 },
    { stepKey: "generate_outline", stepLabel: "개요 생성 중", progressWeight: 35 },
    { stepKey: "generate_draft", stepLabel: "초안 생성 중", progressWeight: 65 },
    { stepKey: "writer_editorial_pass", stepLabel: "작가 편집 중", progressWeight: 75 },
    { stepKey: "generate_review", stepLabel: "검수 리포트 생성 중", progressWeight: 88 },
    { stepKey: "generate_seo", stepLabel: "SEO 패키지 생성 중", progressWeight: 96 },
    { stepKey: "prepare_export", stepLabel: "Export 준비 중", progressWeight: 100 },
  ],
  column_ideas: [
    { stepKey: "load_blog_profile", stepLabel: "BlogProfile 확인 중", progressWeight: 15 },
    { stepKey: "analyze_recent_signals", stepLabel: "최근 신호 분석 중", progressWeight: 35 },
    { stepKey: "generate_topic_ideas", stepLabel: "추천 칼럼 생성 중", progressWeight: 70 },
    { stepKey: "score_topic_ideas", stepLabel: "위험도/검증 상태 계산 중", progressWeight: 88 },
    { stepKey: "finalize_topic_ideas", stepLabel: "추천 목록 정리 중", progressWeight: 100 },
  ],
  github_boost: [
    { stepKey: "load_candidate", stepLabel: "후보 확인 중", progressWeight: 15 },
    { stepKey: "map_queries", stepLabel: "GitHub 검색어 변환 중", progressWeight: 35 },
    { stepKey: "search_github_issues", stepLabel: "GitHub Issues 검색 중", progressWeight: 70 },
    { stepKey: "save_signals", stepLabel: "보강 신호 저장 중", progressWeight: 90 },
    { stepKey: "finalize_github_boost", stepLabel: "보강 결과 정리 중", progressWeight: 100 },
  ],
};

export function getWorkflowRunStepDefinitions(runType: WorkflowRunType) {
  return workflowRunStepDefinitions[runType];
}
