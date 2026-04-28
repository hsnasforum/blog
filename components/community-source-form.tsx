"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { communitySignalTypes } from "@/lib/community/community-types";

type CommunityCandidateOption = {
  id: string;
  keyword: string;
};

const signalTypeLabels: Record<(typeof communitySignalTypes)[number], string> = {
  common_complaint: "공통 불만",
  common_strength: "공통 장점",
  divided_opinion: "의견 갈림",
  beginner_confusion: "초보자 혼란",
  operational_issue: "운영상 문제",
  bug_report: "버그/회귀",
  rumor: "루머 가능성",
  product_update: "제품 업데이트",
  early_news: "조기 소식",
  pricing_change: "가격/과금 변화",
  service_change: "서비스 변화",
  community_reaction: "커뮤니티 반응",
};

export function CommunitySourceForm({
  topicId,
  candidates,
}: {
  topicId: string;
  candidates: CommunityCandidateOption[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: formData.get("candidateId"),
          sourceName: formData.get("sourceName"),
          url: formData.get("url"),
          title: formData.get("title"),
          summary: formData.get("summary"),
          signalType: formData.get("signalType"),
          observedAt: formData.get("observedAt"),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "저장 실패");
      }

      setMessage("수동 커뮤니티 소스를 저장하고 Community Heat를 반영했습니다.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">수동 커뮤니티 소스 입력</h2>
        <p className="mt-1 text-sm text-slate-600">
          국내 커뮤니티는 자동 수집하지 않습니다. 사용자가 직접 확인한 URL과 요약만 저장합니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">후보</span>
          <select
            name="candidateId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.keyword}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">signalType</span>
          <select
            name="signalType"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {communitySignalTypes.map((type) => (
              <option key={type} value={type}>
                {signalTypeLabels[type]} ({type})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">sourceName</span>
          <input
            name="sourceName"
            required
            placeholder="예: Reddit r/LocalLLaMA, GitHub Issues, 블로그 댓글"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">observedAt</span>
          <input
            name="observedAt"
            type="date"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">url</span>
        <input
          name="url"
          required
          type="url"
          placeholder="https://..."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">title</span>
        <input
          name="title"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">summary</span>
        <textarea
          name="summary"
          required
          rows={4}
          placeholder="출처에서 확인한 반응을 요약합니다. 인용문을 만들거나 직접 경험처럼 쓰지 마세요."
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={loading || candidates.length === 0}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "저장 중..." : "수동 소스 저장"}
        </button>
        {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>
    </form>
  );
}
