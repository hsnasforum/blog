"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CandidateOption = {
  id: string;
  keyword: string;
};

export function CommunitySignalActions({
  topicId,
  signalId,
  candidateId,
  riskLevel,
  candidates,
}: {
  topicId: string;
  signalId: string;
  candidateId: string | null;
  riskLevel: string;
  candidates: CandidateOption[];
}) {
  const router = useRouter();
  const [selectedCandidateId, setSelectedCandidateId] = useState(candidateId ?? "");
  const [pending, setPending] = useState<"create" | "connect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createDisabled = riskLevel === "blocked";

  async function createCandidate() {
    setPending("create");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/community/signals/${signalId}/create-candidate`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "후보 생성 실패");
      setMessage("글감 후보를 생성했습니다.");
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "요청 실패");
    } finally {
      setPending(null);
    }
  }

  async function connectCandidate() {
    if (!selectedCandidateId) {
      setError("연결할 후보를 선택하세요.");
      return;
    }

    setPending("connect");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/community/signals/${signalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: selectedCandidateId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "후보 연결 실패");
      setMessage("기존 후보에 연결했습니다.");
      router.refresh();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "요청 실패");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="min-w-56 space-y-2">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={createCandidate}
          disabled={pending !== null || createDisabled}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
        >
          {pending === "create" ? "생성 중..." : "이 신호로 글감 후보 만들기"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        <select
          value={selectedCandidateId}
          onChange={(event) => setSelectedCandidateId(event.target.value)}
          className="max-w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          <option value="">기존 후보 선택</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.keyword}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={connectCandidate}
          disabled={pending !== null || !selectedCandidateId}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending === "connect" ? "연결 중..." : "연결"}
        </button>
      </div>

      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
