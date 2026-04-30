import { TopicIdeasPanel } from "@/components/topic-ideas-panel";

export const dynamic = "force-dynamic";

export default function TopicIdeasPage() {
  return (
    <div className="space-y-4">
      <header className="hero-card p-5">
        <span className="badge badge-accent">Column Ideas</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">AI 추천 칼럼</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          직접 주제를 입력하지 않아도 REFUSE HUB 독자층과 최근 신호를 기준으로 검토할 글감을 제안합니다.
          선택한 아이디어만 Topic으로 만들고 Auto Scout를 실행합니다.
        </p>
      </header>
      <TopicIdeasPanel />
    </div>
  );
}
