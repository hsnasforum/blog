"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreatePostButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/posts/from-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "기획안 생성 실패");
      }
      router.push(`/posts/${payload.post.id}/workflow`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "요청 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? "생성 중..." : "기획안 생성"}
      </button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
