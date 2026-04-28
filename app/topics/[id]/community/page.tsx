import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunitySignalActions } from "@/components/community-signal-actions";
import { CommunitySourceForm } from "@/components/community-source-form";
import { DcinsideHtmlImportForm } from "@/components/dcinside-html-import-form";
import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (!value) return "-";
  return value.toISOString().slice(0, 10);
}

export default async function CommunityPage({ params }: { params: { id: string } }) {
  const topic = await prisma.topic.findUnique({
    where: { id: params.id },
    include: {
      communitySignals: {
        include: {
          candidate: true,
        },
        orderBy: [{ collectedAt: "desc" }],
      },
      trendCandidates: {
        include: {
          communitySignals: {
            orderBy: [{ collectedAt: "desc" }],
          },
        },
        orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!topic) notFound();

  const candidateOptions = topic.trendCandidates.map((candidate) => ({
    id: candidate.id,
    keyword: candidate.keyword,
  }));
  const signals = topic.communitySignals.map((signal) => ({
    ...signal,
    keyword: signal.candidate?.keyword ?? null,
  }));

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Community Radar</h1>
            <p className="mt-1 text-sm text-slate-600">
              커뮤니티 반응은 출처가 있는 신호만 저장합니다. 댓글 전문 대량 저장이나 무단 스크래핑은 하지 않습니다.
            </p>
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              커뮤니티 신호는 사실 확정이 아니라 조기 신호입니다. 공식 확인 전 write_now는 허용하지 않습니다.
            </p>
          </div>
          <Link
            href={`/topics/${topic.id}/trends`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Trend Scout
          </Link>
        </div>
      </header>

      <CommunitySourceForm
        topicId={topic.id}
        candidates={candidateOptions}
      />

      <DcinsideHtmlImportForm
        topicId={topic.id}
        candidates={candidateOptions}
      />

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">저장된 CommunitySignal</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">후보</th>
                <th className="px-2 py-2">source</th>
                <th className="px-2 py-2">sourceTab</th>
                <th className="px-2 py-2">signalType</th>
                <th className="px-2 py-2">risk</th>
                <th className="px-2 py-2">verification</th>
                <th className="px-2 py-2">title</th>
                <th className="px-2 py-2">summary</th>
                <th className="px-2 py-2">engagement</th>
                <th className="px-2 py-2">date</th>
                <th className="px-2 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr key={signal.id} className="border-t border-slate-100 align-top">
                  <td className="px-2 py-2 font-medium text-slate-900">
                    {signal.keyword ?? (
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500">
                        후보 미연결
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    <p>{signal.sourceName}</p>
                    <p className="text-xs text-slate-500">{signal.sourceType}</p>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">{signal.sourceTab ?? "-"}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs ${
                        signal.signalType === "rumor"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}
                    >
                      {signal.signalType}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs ${
                        signal.riskLevel === "high" || signal.riskLevel === "blocked"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {signal.riskLevel}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">{signal.verificationStatus}</td>
                  <td className="px-2 py-2">
                    <a
                      href={signal.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline-offset-2 hover:underline"
                    >
                      {signal.title}
                    </a>
                  </td>
                  <td className="max-w-md px-2 py-2 text-slate-700">{signal.summary}</td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    views {signal.viewCount} / comments {signal.commentCount} / rec {signal.recommendCount}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">
                    {formatDate(signal.publishedAt ?? signal.collectedAt)}
                  </td>
                  <td className="px-2 py-2">
                    <CommunitySignalActions
                      topicId={topic.id}
                      signalId={signal.id}
                      candidateId={signal.candidateId}
                      riskLevel={signal.riskLevel}
                      candidates={candidateOptions}
                    />
                  </td>
                </tr>
              ))}
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border-t border-slate-100 px-2 py-6 text-center text-slate-500">
                    아직 저장된 커뮤니티 신호가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
