import Link from "next/link";

import { TopicCreateForm } from "@/components/topic-create-form";

export default function NewTopicPage() {
  return (
    <section className="space-y-4">
      <header className="hero-card p-5">
        <span className="badge badge-accent">Topic Scout</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Topic 입력</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          큰 주제를 입력하면 Auto Scout가 후보 생성, 점수 계산, 가능한 외부 신호 수집까지 이어서 실행합니다.
        </p>
        <div className="mt-4">
          <Link href="/topics/ideas" className="btn">
            직접 입력 대신 추천 칼럼 보기
          </Link>
        </div>
      </header>
      <TopicCreateForm />
    </section>
  );
}
