import { TopicCreateForm } from "@/components/topic-create-form";

export default function NewTopicPage() {
  return (
    <section className="space-y-4">
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">Topic 입력</h1>
        <p className="mt-1 text-sm text-slate-600">
          큰 주제를 입력하면 Trend Scout 페이지에서 후보 생성/점수 계산/기획안 생성으로 이어집니다.
        </p>
      </header>
      <TopicCreateForm />
    </section>
  );
}
