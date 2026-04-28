"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  officialSourceTypeLabels,
  officialSourceTypeGuidance,
  officialSourceTypes,
  officialVerificationStatusLabels,
  officialVerificationStatusGuidance,
  officialVerificationStatuses,
  officialWriteNowRules,
  recommendedVerificationStatusBySourceType,
  type OfficialSourceType,
  type OfficialVerificationStatus,
} from "@/lib/official-source/official-source-types";

type CommunitySignalOption = {
  id: string;
  title: string;
};

export function OfficialSourceForm({
  topicId,
  candidateId,
  communitySignals,
}: {
  topicId: string;
  candidateId: string;
  communitySignals: CommunitySignalOption[];
}) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<OfficialSourceType>("official_doc");
  const [verificationStatus, setVerificationStatus] =
    useState<OfficialVerificationStatus>("official_confirmed");
  const [communitySignalId, setCommunitySignalId] = useState(communitySignals[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState<OfficialVerificationStatus | "add" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(statusOverride?: OfficialVerificationStatus) {
    const status = statusOverride ?? verificationStatus;
    const noteRequired = status === "contradicted" || status === "rejected_as_rumor";
    if (noteRequired && !note.trim()) {
      setMessage(null);
      setError("반박됨 또는 루머 처리됨 상태로 저장하려면 note에 근거를 남겨주세요.");
      return;
    }

    setPendingStatus(statusOverride ?? "add");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/candidates/${candidateId}/official-sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communitySignalId: communitySignalId || null,
          sourceType,
          title,
          url,
          note,
          verificationStatus: status,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "공식 출처 저장 실패");
      setVerificationStatus(status);
      setMessage(`${officialVerificationStatusLabels[status]} 상태로 공식 출처를 추가했습니다.`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청 실패");
    } finally {
      setPendingStatus(null);
    }
  }

  function handleSourceTypeChange(nextSourceType: OfficialSourceType) {
    setSourceType(nextSourceType);
    setVerificationStatus(recommendedVerificationStatusBySourceType[nextSourceType]);
  }

  const noteRequired = verificationStatus === "contradicted" || verificationStatus === "rejected_as_rumor";
  const submitDisabled = pendingStatus !== null || !title.trim() || !url.trim() || (noteRequired && !note.trim());

  return (
    <div className="mt-2 min-w-72 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
      <p className="font-semibold text-slate-800">공식 출처 추가</p>
      <p className="mt-1 text-slate-600">
        공식 문서, 공식 블로그, GitHub release, GitHub issue, X 원문, 뉴스, 기타 출처를 URL과 짧은 메모로만 저장합니다.
      </p>
      <div className="mt-2 grid gap-1">
        <select
          value={sourceType}
          onChange={(event) => handleSourceTypeChange(event.target.value as OfficialSourceType)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {officialSourceTypes.map((type) => (
            <option key={type} value={type}>
              {officialSourceTypeLabels[type]}
            </option>
          ))}
        </select>
        <p className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-blue-800">
          {officialSourceTypeGuidance[sourceType]}
        </p>
        {communitySignals.length > 0 ? (
          <select
            value={communitySignalId}
            onChange={(event) => setCommunitySignalId(event.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="">커뮤니티 신호 연결 안 함</option>
            {communitySignals.map((signal) => (
              <option key={signal.id} value={signal.id}>
                {signal.title}
              </option>
            ))}
          </select>
        ) : null}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="공식 출처 제목"
          className="rounded-md border border-slate-300 px-2 py-1"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          className="rounded-md border border-slate-300 px-2 py-1"
        />
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={noteRequired ? "반박/루머 판단 근거를 반드시 입력" : "짧은 확인 메모"}
          rows={2}
          className="rounded-md border border-slate-300 px-2 py-1"
        />
        <select
          value={verificationStatus}
          onChange={(event) => setVerificationStatus(event.target.value as OfficialVerificationStatus)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {officialVerificationStatuses.map((status) => (
            <option key={status} value={status}>
              {officialVerificationStatusLabels[status]}
            </option>
          ))}
        </select>
        <p className="rounded border border-amber-100 bg-amber-50 px-2 py-1 text-amber-800">
          {officialVerificationStatusGuidance[verificationStatus]}
        </p>
        <div className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600">
          <p className="font-medium text-slate-700">write_now 조건</p>
          <ul className="mt-1 space-y-0.5">
            {officialWriteNowRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => submit()}
          disabled={submitDisabled}
          className="rounded-md bg-slate-900 px-2 py-1 text-white disabled:opacity-50"
        >
          {pendingStatus === "add" ? "저장 중..." : "공식 출처 추가"}
        </button>
        <button
          type="button"
          onClick={() => submit("official_confirmed")}
          disabled={submitDisabled}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700 disabled:opacity-50"
        >
          official_confirmed로 표시
        </button>
        <button
          type="button"
          onClick={() => submit("contradicted")}
          disabled={submitDisabled}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 disabled:opacity-50"
        >
          contradicted로 표시
        </button>
        <button
          type="button"
          onClick={() => submit("rejected_as_rumor")}
          disabled={submitDisabled}
          className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700 disabled:opacity-50"
        >
          rejected_as_rumor로 표시
        </button>
      </div>
      {message ? <p className="mt-1 text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-1 text-rose-600">{error}</p> : null}
    </div>
  );
}
