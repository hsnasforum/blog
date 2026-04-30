"use client";

import { useEffect, useMemo, useState } from "react";

import type { WorkflowRunSnapshot } from "@/lib/auto-workflow/auto-workflow-types";

type WorkflowRunProgressPanelProps = {
  runId: string | null;
  title?: string;
  compact?: boolean;
  onComplete?: (run: WorkflowRunSnapshot) => void;
};

const statusLabels: Record<string, string> = {
  queued: "대기",
  running: "실행 중",
  success: "완료",
  partial: "경고 있음",
  failed: "실패",
  cancelled: "취소됨",
};

function statusTone(status: string) {
  if (status === "success") return "badge-success";
  if (status === "partial" || status === "queued" || status === "running") return "badge-warning";
  if (status === "failed" || status === "cancelled") return "badge-danger";
  return "";
}

function stepMark(status: string) {
  if (status === "success") return "✓";
  if (status === "skipped") return "-";
  if (status === "running") return "●";
  if (status === "failed") return "!";
  return "○";
}

function formatElapsed(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}분 ${rest}초` : `${rest}초`;
}

export function WorkflowRunProgressPanel({
  runId,
  title = "자동 진행 상태",
  compact = false,
  onComplete,
}: WorkflowRunProgressPanelProps) {
  const [run, setRun] = useState<WorkflowRunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/workflow-runs/${runId}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "WorkflowRun 상태 조회 실패");
        if (cancelled) return;
        setRun(payload);
        setError(null);
        if (payload.status === "running" || payload.status === "queued") {
          timer = setTimeout(load, 1200);
        } else {
          onComplete?.(payload);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "WorkflowRun 상태 조회 실패");
        timer = setTimeout(load, 2500);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, onComplete]);

  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "queued")) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [run]);

  const failedStep = useMemo(
    () => run?.steps.find((step) => step.status === "failed") ?? null,
    [run],
  );

  if (!runId) return null;

  return (
    <section className={`rounded-lg border border-slate-200 bg-white/75 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {run ? (
            <p className="mt-1 text-xs text-slate-500">
              현재 단계: {run.currentStepLabel ?? "-"} · 경과 {formatElapsed(run.startedAt, run.finishedAt)}
              <span className="sr-only">{tick}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">상태를 불러오는 중입니다.</p>
          )}
        </div>
        {run ? <span className={`badge ${statusTone(run.status)}`}>{statusLabels[run.status] ?? run.status}</span> : null}
      </div>

      {run ? (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                run.status === "failed" ? "bg-rose-500" : run.status === "partial" ? "bg-amber-500" : "bg-blue-600"
              }`}
              style={{ width: `${Math.max(0, Math.min(100, run.progressPercent))}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{run.progressPercent}%</span>
            <span>마지막 갱신: {new Date(run.updatedAt).toLocaleTimeString("ko-KR", { hour12: false })}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">run: {run.id}</p>

          <ol className={`mt-3 grid gap-1.5 ${compact ? "" : "md:grid-cols-2"}`}>
            {run.steps.map((step) => (
              <li
                key={step.id}
                className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${
                  step.status === "failed"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : step.status === "running"
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <span className="mt-0.5 w-4 font-bold">{stepMark(step.status)}</span>
                <span>
                  <span className="font-medium">{step.stepLabel}</span>
                  {step.message ? <span className="block text-slate-500">{step.message}</span> : null}
                  {step.generationLogId ? <span className="block text-slate-400">log: {step.generationLogId}</span> : null}
                  {step.errorMessage ? <span className="block text-rose-600">{step.errorMessage}</span> : null}
                </span>
              </li>
            ))}
          </ol>

          {run.warnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <p className="font-semibold">확인 필요</p>
              <ul className="mt-1 space-y-1">
                {run.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {failedStep ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
              <p className="font-semibold">실패 단계: {failedStep.stepLabel}</p>
              <p>{failedStep.errorMessage ?? run.errorMessage ?? "실패 원인을 확인해야 합니다."}</p>
            </div>
          ) : null}

          {run.status === "success" || run.status === "partial" ? (
            <p className="mt-3 text-xs font-medium text-blue-700">
              {run.status === "partial" ? "일부 경고가 있습니다. " : ""}
              자동 생성이 완료되었습니다. 승인 전 본문과 검수 리포트를 확인하세요.
            </p>
          ) : null}
        </>
      ) : null}

      {error ? <p className="mt-3 text-xs text-rose-600">{error}</p> : null}
    </section>
  );
}
