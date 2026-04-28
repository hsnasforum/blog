"use client";

import { useState } from "react";

import {
  buildGenerationMessage,
  type GenerationMetadata,
  type GenerationStatus,
} from "@/lib/writer/generation-status";
import { PostExportPanel } from "@/components/post-export-panel";

type WorkflowStep = "outline" | "draft" | "review" | "approved";

type ActionMessage = {
  tone: "success" | "warning";
  text: string;
};

type WorkflowPost = {
  id: string;
  title: string;
  angle: string | null;
  outline: string | null;
  draft: string | null;
  reviewReport: string | null;
  seoPackage: string | null;
  workflowStep: WorkflowStep;
};

const workflowSteps: WorkflowStep[] = ["outline", "draft", "review", "approved"];
const approvableSteps: WorkflowStep[] = ["review", "approved"];

function stepClass(activeStep: WorkflowStep, currentStep: WorkflowStep) {
  const activeIndex = workflowSteps.indexOf(activeStep);
  const currentIndex = workflowSteps.indexOf(currentStep);

  if (currentIndex < activeIndex) {
    return "border-slate-300 bg-white text-slate-500";
  }
  if (currentIndex === activeIndex) {
    return "border-indigo-400 bg-indigo-50 text-indigo-700";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-700";
}

function hasContent(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function canApprovePost(post: WorkflowPost) {
  return (
    hasContent(post.outline) &&
    hasContent(post.draft) &&
    hasContent(post.reviewReport) &&
    approvableSteps.includes(post.workflowStep)
  );
}

export function WorkflowEditor({ initialPost }: { initialPost: WorkflowPost }) {
  const [post, setPost] = useState(initialPost);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canApprove = canApprovePost(post);

  function updatePost(updated: Partial<WorkflowPost>) {
    setPost((previous) => ({ ...previous, ...updated }));
  }

  async function callGenerate(endpoint: string, actionLabel: string) {
    setPending(actionLabel);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "요청 실패");
      }
      updatePost(payload.post);
      const metadata: Partial<GenerationMetadata> = {
        generationStatus: payload.generationStatus as GenerationStatus | undefined,
        providerError: payload.providerError,
        fallbackReason: payload.fallbackReason,
      };
      setMessage({
        tone: payload.generationStatus === "fallback" ? "warning" : "success",
        text: buildGenerationMessage(metadata, `${actionLabel} 완료`),
      });
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "요청 실패");
    } finally {
      setPending(null);
    }
  }

  async function savePatch(patch: Partial<WorkflowPost>, label: string) {
    setPending(label);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "저장 실패");
      }
      updatePost(payload.post);
      setMessage({ tone: "success", text: `${label} 완료` });
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "저장 실패");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {workflowSteps.map((step) => (
          <span
            key={step}
            className={`rounded-md border px-3 py-1 text-xs font-medium ${stepClass(step, post.workflowStep)}`}
          >
            {step}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => callGenerate(`/api/posts/${post.id}/generate-outline`, "개요 생성")}
          disabled={pending !== null}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          {pending === "개요 생성" ? "실행 중..." : "개요 생성"}
        </button>
        <button
          type="button"
          onClick={() => callGenerate(`/api/posts/${post.id}/generate-draft`, "초안 생성")}
          disabled={pending !== null}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          {pending === "초안 생성" ? "실행 중..." : "초안 생성"}
        </button>
        <button
          type="button"
          onClick={() => callGenerate(`/api/posts/${post.id}/review`, "검수 실행")}
          disabled={pending !== null}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending === "검수 실행" ? "실행 중..." : "검수 실행"}
        </button>
        <button
          type="button"
          onClick={() => savePatch({ workflowStep: "approved" }, "승인 처리")}
          disabled={pending !== null || !canApprove}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending === "승인 처리" ? "처리 중..." : "승인 처리"}
        </button>
      </div>

      {!canApprove ? (
        <p className="text-sm text-slate-500">
          개요, 초안 본문, 검수 리포트가 생성되고 검수 단계에 도달해야 승인할 수 있습니다.
        </p>
      ) : null}

      {message ? (
        <p
          className={`text-sm ${
            message.tone === "warning" ? "text-amber-700" : "text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="post-title">
              제목
            </label>
            <input
              id="post-title"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={post.title}
              onChange={(event) => updatePost({ title: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="post-angle">
              글 방향
            </label>
            <textarea
              id="post-angle"
              className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={post.angle ?? ""}
              onChange={(event) => updatePost({ angle: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="post-outline">
              outline
            </label>
            <textarea
              id="post-outline"
              className="min-h-44 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={post.outline ?? ""}
              onChange={(event) => updatePost({ outline: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="post-draft">
              draft
            </label>
            <textarea
              id="post-draft"
              className="min-h-[420px] w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={post.draft ?? ""}
              onChange={(event) => updatePost({ draft: event.target.value })}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              savePatch(
                {
                  title: post.title,
                  angle: post.angle,
                  outline: post.outline,
                  draft: post.draft,
                  reviewReport: post.reviewReport,
                  seoPackage: post.seoPackage,
                },
                "내용 저장",
              )
            }
            disabled={pending !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
          >
            {pending === "내용 저장" ? "저장 중..." : "내용 저장"}
          </button>
        </section>

        <aside className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="review-report">
              review 리포트
            </label>
            <textarea
              id="review-report"
              className="min-h-64 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={post.reviewReport ?? ""}
              onChange={(event) => updatePost({ reviewReport: event.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-800" htmlFor="seo-package">
              SEO 패키지
            </label>
            <textarea
              id="seo-package"
              className="min-h-48 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
              value={post.seoPackage ?? ""}
              onChange={(event) => updatePost({ seoPackage: event.target.value })}
            />
          </div>
        </aside>
      </div>

      <PostExportPanel post={post} />
    </div>
  );
}
