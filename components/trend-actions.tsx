"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  buildGenerationMessage,
  type GenerationMetadata,
  type GenerationStatus,
} from "@/lib/writer/generation-status";

type ActionMessage = {
  tone: "success" | "warning";
  text: string;
};

export function TrendActions({
  topicId,
  trendCollectionEnabled,
}: {
  topicId: string;
  trendCollectionEnabled: boolean;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"generate" | "score" | "collect" | "community" | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "generate" | "score" | "collect" | "community") {
    setLoadingAction(action);
    setMessage(null);
    setError(null);

    const endpoint =
      action === "generate"
        ? `/api/topics/${topicId}/generate-candidates`
        : action === "score"
          ? `/api/topics/${topicId}/score-candidates`
          : action === "collect"
            ? `/api/topics/${topicId}/collect-trends`
            : `/api/topics/${topicId}/collect-community`;

    try {
      const response = await fetch(endpoint, { method: "POST" });
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
        action === "generate"
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
          payload.collectionStatus === "partial" ||
          payload.collectionStatus === "failed"
            ? "warning"
            : "success",
        text: payload.warning ?? buildGenerationMessage(metadata, successMessage),
      });
      router.refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "요청 실패");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => runAction("generate")}
        disabled={loadingAction !== null}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
      >
        {loadingAction === "generate" ? "생성 중..." : "키워드 후보 생성"}
      </button>
      <button
        type="button"
        onClick={() => runAction("score")}
        disabled={loadingAction !== null}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {loadingAction === "score" ? "계산 중..." : "화제성 점수 계산"}
      </button>
      <button
        type="button"
        onClick={() => runAction("collect")}
        disabled={loadingAction !== null || !trendCollectionEnabled}
        className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 disabled:opacity-60"
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
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 disabled:opacity-60"
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
  );
}
