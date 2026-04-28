"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GitHubIssuesCollectButtonProps = {
  topicId: string;
  candidateId: string;
};

export function GitHubIssuesCollectButton({ topicId, candidateId }: GitHubIssuesCollectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function collectGitHubIssues() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/candidates/${candidateId}/collect-github-issues`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "GitHub Issues 보강 검색 실패");
      }

      const countText = `${payload.signalCount ?? 0}개 GitHub Issue 신호를 연결했습니다.`;
      setMessage(payload.warning ? `${countText} ${payload.warning}` : countText);
      router.refresh();
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : "GitHub Issues 보강 검색 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={collectGitHubIssues}
        disabled={loading}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "GitHub 검색 중..." : "GitHub Issues로 보강 검색"}
      </button>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
