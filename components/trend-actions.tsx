"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  buildGenerationMessage,
  type GenerationMetadata,
  type GenerationStatus,
} from "@/lib/writer/generation-status";
import { WorkflowRunProgressPanel } from "@/components/workflow-run-progress-panel";

type ActionMessage = {
  tone: "success" | "warning";
  text: string;
};

export function TrendActions({
  topicId,
  trendCollectionEnabled,
  candidateCount,
  initialAutoScoutRunId = null,
}: {
  topicId: string;
  trendCollectionEnabled: boolean;
  candidateCount: number;
  initialAutoScoutRunId?: string | null;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"auto" | "generate" | "score" | "collect" | "community" | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialAutoScoutRunId);

  async function runAction(action: "auto" | "generate" | "score" | "collect" | "community") {
    const regenerate =
      action === "auto" &&
      candidateCount > 0 &&
      window.confirm("이미 생성된 후보가 있습니다. 기존 후보를 삭제하고 Auto Scout를 다시 실행할까요?");
    if (action === "auto" && candidateCount > 0 && !regenerate) {
      return;
    }

    setLoadingAction(action);
    setMessage(null);
    setError(null);
    if (action === "auto") setActiveRunId(null);

    const endpoint =
      action === "auto"
        ? `/api/topics/${topicId}/auto-scout`
        : action === "generate"
        ? `/api/topics/${topicId}/generate-candidates`
        : action === "score"
          ? `/api/topics/${topicId}/score-candidates`
          : action === "collect"
            ? `/api/topics/${topicId}/collect-trends`
            : `/api/topics/${topicId}/collect-community`;

    try {
      let runId: string | null = null;
      if (action === "auto") {
        const runResponse = await fetch("/api/workflow-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runType: "auto_scout", topicId }),
        });
        const runPayload = await runResponse.json();
        if (!runResponse.ok) {
          throw new Error(runPayload.error ?? "WorkflowRun 생성 실패");
        }
        runId = runPayload.id;
        setActiveRunId(runId);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: action === "auto" ? { "Content-Type": "application/json" } : undefined,
        body: action === "auto" ? JSON.stringify({ regenerate, runId }) : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "요청 실패");
      }

      const metadata: Partial<GenerationMetadata> = {
        generationStatus: payload.generationStatus as GenerationStatus | undefined,
        providerError: payload.providerError,
        fallbackReason: payload.fallbackReason,
      };
      const successMessage =
        action === "auto"
          ? payload.status === "partial"
            ? "Auto Scout가 일부 경고와 함께 완료되었습니다."
            : payload.status === "failed"
              ? "Auto Scout가 실패했습니다."
              : "Auto Scout가 완료되었습니다."
        : action === "generate"
          ? "후보를 생성했습니다."
          : action === "score"
            ? "점수 계산을 완료했습니다."
            : action === "collect"
              ? payload.collectionStatus === "partial"
                ? "일부 외부 트렌드 신호를 수집했습니다."
                : payload.collectionStatus === "failed"
                  ? "외부 트렌드 신호 수집에 실패했습니다."
                  : "외부 트렌드 신호를 수집했습니다."
              : payload.collectionStatus === "partial"
                ? "일부 커뮤니티 신호를 수집했습니다."
                : payload.collectionStatus === "failed"
                  ? "커뮤니티 신호 수집에 실패했습니다."
                  : "커뮤니티 신호를 수집했습니다.";
      setMessage({
        tone:
          payload.generationStatus === "fallback" ||
          payload.generationStatus === "partial" ||
          payload.collectionStatus === "partial" ||
          payload.collectionStatus === "failed" ||
          payload.status === "partial" ||
          payload.status === "failed"
            ? "warning"
            : "success",
        text: payload.warning ?? payload.warnings?.[0] ?? buildGenerationMessage(metadata, successMessage),
      });
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "요청 실패");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => runAction("auto")}
          disabled={loadingAction !== null}
          className="btn btn-primary disabled:opacity-60"
        >
          {loadingAction === "auto" ? "Auto Scout 실행 중..." : "Auto Scout 실행"}
        </button>
        <button
          type="button"
          onClick={() => runAction("generate")}
          disabled={loadingAction !== null}
          className="btn disabled:opacity-60"
        >
          {loadingAction === "generate" ? "생성 중..." : "키워드 후보 생성"}
        </button>
        <button
          type="button"
          onClick={() => runAction("score")}
          disabled={loadingAction !== null}
          className="btn btn-primary disabled:opacity-60"
        >
          {loadingAction === "score" ? "계산 중..." : "화제성 점수 계산"}
        </button>
        <button
          type="button"
          onClick={() => runAction("collect")}
          disabled={loadingAction !== null || !trendCollectionEnabled}
          className="btn disabled:opacity-60"
        >
          {loadingAction === "collect" ? "수집 중..." : "트렌드 신호 수집"}
        </button>
        {!trendCollectionEnabled ? (
          <span className="text-sm text-amber-700">
            NAVER_CLIENT_ID/SECRET이 없어 외부 트렌드 수집은 비활성화됩니다.
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => runAction("community")}
          disabled={loadingAction !== null}
          className="btn disabled:opacity-60"
        >
          {loadingAction === "community" ? "수집 중..." : "Community Radar 수집"}
        </button>
        {message ? (
          <span
            className={`text-sm ${
              message.tone === "warning" ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {message.text}
          </span>
        ) : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>
      <WorkflowRunProgressPanel runId={activeRunId} title="Auto Scout 진행률" />
    </div>
  );
}
