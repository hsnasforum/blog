"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TopicCreateForm() {
  const router = useRouter();
  const [rawTopic, setRawTopic] = useState("");
  const [memo, setMemo] = useState("");
  const [optionalKeywords, setOptionalKeywords] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawTopic,
          memo,
          optionalKeywords,
          avoidTopics,
        }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "토픽 생성 실패");
      }

      const payload = await response.json();
      router.push(`/topics/${payload.topic.id}/trends`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청 처리 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="rawTopic">
          rawTopic
        </label>
        <input
          id="rawTopic"
          value={rawTopic}
          onChange={(event) => setRawTopic(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="예: AI"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="memo">
          memo
        </label>
        <textarea
          id="memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="이번 주에 다루고 싶은 관점, 참고 링크 요약 등"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="optionalKeywords">
          optionalKeywords
        </label>
        <input
          id="optionalKeywords"
          value={optionalKeywords}
          onChange={(event) => setOptionalKeywords(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="쉼표 또는 줄바꿈으로 구분"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="avoidTopics">
          avoidTopics
        </label>
        <input
          id="avoidTopics"
          value={avoidTopics}
          onChange={(event) => setAvoidTopics(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="피하고 싶은 주제/표현"
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "생성 중..." : "Trend Scout로 이동"}
      </button>
    </form>
  );
}
