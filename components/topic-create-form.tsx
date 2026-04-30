"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { WorkflowRunProgressPanel } from "@/components/workflow-run-progress-panel";

export function TopicCreateForm() {
  const router = useRouter();
  const [rawTopic, setRawTopic] = useState("");
  const [memo, setMemo] = useState("");
  const [optionalKeywords, setOptionalKeywords] = useState("");
  const [avoidTopics, setAvoidTopics] = useState("");
  const [autoScout, setAutoScout] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setRunId(null);

    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawTopic,
          memo,
          optionalKeywords,
          avoidTopics,
          autoScout: false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "토픽 생성 실패");
      }

      const payload = await response.json();
      if (autoScout) {
        const runResponse = await fetch("/api/workflow-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runType: "auto_scout", topicId: payload.topic.id }),
        });
        const runPayload = await runResponse.json();
        if (!runResponse.ok) {
          throw new Error(runPayload.error ?? "WorkflowRun 생성 실패");
        }
        setRunId(runPayload.id);

        const scoutResponse = await fetch(`/api/topics/${payload.topic.id}/auto-scout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: runPayload.id }),
        });
        const scoutPayload = await scoutResponse.json();
        if (!scoutResponse.ok) {
          throw new Error(scoutPayload.error ?? scoutPayload.warnings?.[0] ?? "Auto Scout 실패");
        }
      }
      router.push(`/topics/${payload.topic.id}/trends`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청 처리 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="rawTopic">
          rawTopic
        </label>
        <input
          id="rawTopic"
          value={rawTopic}
          onChange={(event) => setRawTopic(event.target.value)}
          className="field"
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
          className="field min-h-24"
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
          className="field"
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
          className="field"
          placeholder="피하고 싶은 주제/표현"
        />
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <WorkflowRunProgressPanel runId={runId} title="Auto Scout 진행률" />

      <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={autoScout}
          onChange={(event) => setAutoScout(event.target.checked)}
          className="mt-1"
        />
        <span>
          생성 후 Auto Scout 실행
          <span className="block text-xs text-slate-500">
            후보 생성, 점수 계산, 수집 가능한 외부/커뮤니티 신호를 자동으로 진행합니다.
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary disabled:opacity-60"
      >
        {loading ? (autoScout ? "Auto Scout 실행 중..." : "생성 중...") : "Trend Scout로 이동"}
      </button>
    </form>
  );
}
