"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { WorkflowRunProgressPanel } from "@/components/workflow-run-progress-panel";
import type { TopicIdea } from "@/lib/topic-ideas/topic-idea-types";

function riskBadgeClass(riskLevel: TopicIdea["riskLevel"]) {
  if (riskLevel === "high") return "badge-danger";
  if (riskLevel === "medium") return "badge-warning";
  return "badge-success";
}

function verificationLabel(status: TopicIdea["verificationStatus"]) {
  if (status === "official_confirmed") return "공식 확인 있음";
  if (status === "community_only") return "커뮤니티 조기 신호";
  return "공식 확인 필요";
}

export function TopicIdeasPanel() {
  const router = useRouter();
  const [focusKeyword, setFocusKeyword] = useState("");
  const [ideas, setIdeas] = useState<TopicIdea[]>([]);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  async function generateIdeas() {
    setLoading(true);
    setError(null);
    setFallbackReason(null);
    setRunId(null);

    try {
      const runResponse = await fetch("/api/workflow-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runType: "column_ideas" }),
      });
      const runPayload = await runResponse.json();
      if (!runResponse.ok) {
        throw new Error(runPayload.error ?? "WorkflowRun 생성 실패");
      }
      setRunId(runPayload.id);

      const response = await fetch("/api/topic-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focusKeyword, runId: runPayload.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "추천 칼럼 생성 실패");
      }
      setIdeas(payload.ideas ?? []);
      setGenerationStatus(payload.generationStatus ?? null);
      setFallbackReason(payload.fallbackReason ?? null);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "추천 칼럼 생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function convertToTopic(idea: TopicIdea, index: number) {
    setConvertingId(`${idea.rawTopic}-${index}`);
    setError(null);

    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawTopic: idea.rawTopic,
          memo: idea.memo,
          optionalKeywords: idea.optionalKeywords,
          avoidTopics: idea.avoidTopics,
          autoScout: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Topic 변환 실패");
      }
      router.push(`/topics/${payload.topic.id}/trends`);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Topic 변환 실패");
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="glass-card space-y-4 p-5">
        <div>
          <h2 className="section-title">추천 칼럼 생성</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            BlogProfile과 최근 커뮤니티/후보/공식 출처 신호를 바탕으로 오늘 검토할 글감을 제안합니다.
            추천은 글감 제안일 뿐이며 자동 발행이나 자동 승인은 하지 않습니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={focusKeyword}
            onChange={(event) => setFocusKeyword(event.target.value)}
            className="field"
            placeholder="선택: Claude Code, Codex, 블로그 자동화 같은 관심 키워드"
          />
          <button type="button" onClick={generateIdeas} disabled={loading} className="btn btn-primary disabled:opacity-60">
            {loading ? "추천 생성 중..." : "오늘 쓸 만한 글감 추천"}
          </button>
        </div>
        {generationStatus ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`badge ${generationStatus === "fallback" ? "badge-warning" : "badge-success"}`}>
              generationStatus: {generationStatus}
            </span>
            {fallbackReason ? <span className="badge badge-warning">{fallbackReason}</span> : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <WorkflowRunProgressPanel runId={runId} title="Column Ideas 진행률" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {ideas.map((idea, index) => (
          <article key={`${idea.rawTopic}-${index}`} className="glass-card space-y-3 p-5">
            <div className="flex flex-wrap gap-1.5">
              <span className="badge badge-accent">{idea.estimatedVerdict}</span>
              <span className={`badge ${riskBadgeClass(idea.riskLevel)}`}>risk: {idea.riskLevel}</span>
              <span className="badge">{verificationLabel(idea.verificationStatus)}</span>
            </div>
            <div>
              <h3 className="text-lg font-bold leading-7 text-slate-900">{idea.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{idea.reason}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-slate-900">추천 방향</p>
              <p>{idea.suggestedAngle}</p>
            </div>
            <dl className="grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-900">rawTopic</dt>
                <dd>{idea.rawTopic}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">키워드</dt>
                <dd>{idea.optionalKeywords}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-semibold text-slate-900">예상 독자</dt>
                <dd>{idea.targetAudience}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-semibold text-slate-900">관련 신호</dt>
                <dd>{idea.sourceHints.join(", ") || "-"}</dd>
              </div>
            </dl>
            {idea.verificationStatus !== "official_confirmed" ? (
              <p className="text-xs font-medium text-amber-700">
                공식 확인이 필요한 글감입니다. Trend Scout에서 write_now로 자동 승격하지 않습니다.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => convertToTopic(idea, index)}
              disabled={Boolean(convertingId)}
              className="btn btn-primary disabled:opacity-60"
            >
              {convertingId === `${idea.rawTopic}-${index}` ? "Topic 생성 및 Auto Scout 중..." : "Topic으로 만들기"}
            </button>
          </article>
        ))}
      </section>

      {ideas.length === 0 ? (
        <section className="glass-card p-5 text-sm leading-6 text-slate-600">
          추천을 실행하면 5~10개의 칼럼 후보가 여기에 표시됩니다.
        </section>
      ) : null}
    </div>
  );
}
