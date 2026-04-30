"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { WorkflowRunProgressPanel } from "@/components/workflow-run-progress-panel";

type AutoDraftButtonProps = {
  topicId: string;
  candidateId: string;
  hasPost: boolean;
  initialRunId?: string | null;
};

const stepLabels: Record<string, string> = {
  createPost: "Post 생성",
  angle: "기획안 생성",
  outline: "개요 생성",
  draft: "초안 생성",
  review: "검수 리포트 생성",
  seo: "SEO package 생성",
  export: "Export package 준비",
  reusePost: "기존 글 재사용",
};

export function AutoDraftButton({ topicId, candidateId, hasPost, initialRunId = null }: AutoDraftButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(initialRunId);

  async function runAutoDraft() {
    const regenerate = hasPost && window.confirm("이미 연결된 글이 있습니다. 초안/검수/SEO를 재생성할까요?");
    if (hasPost && !regenerate) return;

    setLoading(true);
    setMessage(null);
    setError(null);
    setRunId(null);
    setSteps(["Post 생성", "기획안 생성", "개요 생성", "초안 생성", "검수 리포트 생성", "SEO package 생성", "Export package 준비"]);

    try {
      const runResponse = await fetch("/api/workflow-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runType: "auto_draft", topicId, candidateId }),
      });
      const runPayload = await runResponse.json();
      if (!runResponse.ok) {
        throw new Error(runPayload.error ?? "WorkflowRun 생성 실패");
      }
      setRunId(runPayload.id);

      const response = await fetch(`/api/topics/${topicId}/candidates/${candidateId}/auto-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate, runId: runPayload.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? payload.warnings?.[0] ?? "Auto Draft 실패");
      }

      setSteps((payload.completedSteps ?? []).map((step: string) => stepLabels[step] ?? step));
      setMessage(
        payload.status === "partial"
          ? "일부 경고와 함께 review 단계까지 생성했습니다. 승인 전 검토가 필요합니다."
          : "review 단계까지 자동 생성했습니다. 승인 전 검토가 필요합니다.",
      );
      router.refresh();
      if (payload.postId) {
        router.push(`/posts/${payload.postId}/workflow`);
      }
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Auto Draft 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runAutoDraft}
        disabled={loading}
        className="btn btn-primary min-h-0 px-3 py-1.5 text-xs disabled:opacity-60"
      >
        {loading ? "글 생성 중..." : "이 후보로 글 생성"}
      </button>
      {loading || steps.length > 0 ? (
        <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
          {steps.map((step) => (
            <span key={step} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              {step}
            </span>
          ))}
        </div>
      ) : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <WorkflowRunProgressPanel runId={runId} title="Auto Draft 진행률" compact />
    </div>
  );
}
