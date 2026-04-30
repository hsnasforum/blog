import Link from "next/link";
import { notFound } from "next/navigation";

import { TrendCandidateCard } from "@/components/trend-candidate-card";
import { TrendActions } from "@/components/trend-actions";
import { prisma } from "@/lib/prisma";
import { isTrendCollectionConfigured } from "@/lib/trend/naver-config";

function isVerdictKey(
  verdict: string | null,
): verdict is "write_now" | "review_first" | "hold" | "reject" {
  return verdict === "write_now" || verdict === "review_first" || verdict === "hold" || verdict === "reject";
}

export default async function TrendScoutPage({ params }: { params: { id: string } }) {
  const topic = await prisma.topic.findUnique({
    where: { id: params.id },
    include: {
      trendCandidates: {
        include: {
          trendSignals: {
            orderBy: [{ source: "asc" }, { collectedAt: "desc" }],
          },
          communitySignals: {
            orderBy: [{ collectedAt: "desc" }],
          },
          officialSources: {
            orderBy: [{ addedAt: "desc" }],
          },
          workflowRuns: {
            where: { runType: "auto_draft" },
            orderBy: { startedAt: "desc" },
            take: 1,
          },
          posts: {
            orderBy: [{ createdAt: "desc" }],
          },
        },
        orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!topic) notFound();

  const verdictCount = topic.trendCandidates.reduce(
    (acc, candidate) => {
      if (isVerdictKey(candidate.verdict)) {
        acc[candidate.verdict] += 1;
      } else {
        acc.unscored += 1;
      }
      return acc;
    },
    {
      write_now: 0,
      review_first: 0,
      hold: 0,
      reject: 0,
      unscored: 0,
    },
  );
  const latestAutoScoutLog = await prisma.generationLog.findFirst({
    where: {
      action: "autoScout",
      inputSummary: {
        contains: `topicId=${topic.id}`,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const latestAutoScoutRun = await prisma.workflowRun.findFirst({
    where: {
      topicId: topic.id,
      runType: "auto_scout",
    },
    orderBy: { startedAt: "desc" },
  });
  const autoScoutStats = {
    candidates: topic.trendCandidates.length,
    trendSignals: topic.trendCandidates.reduce((sum, candidate) => sum + candidate.trendSignals.length, 0),
    communitySignals: topic.trendCandidates.reduce((sum, candidate) => sum + candidate.communitySignals.length, 0),
    githubSignals: topic.trendCandidates.reduce(
      (sum, candidate) => sum + candidate.communitySignals.filter((signal) => signal.sourceType === "github_issues").length,
      0,
    ),
    officialSources: topic.trendCandidates.reduce((sum, candidate) => sum + candidate.officialSources.length, 0),
  };

  return (
    <div className="space-y-4">
      <header className="hero-card p-5">
        <span className="badge badge-accent">Trend Scout</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">글감 후보 스카우트</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          rawTopic: <span className="font-medium text-slate-800">{topic.rawTopic}</span>
        </p>
        {topic.memo ? <p className="mt-1 text-sm text-slate-600">memo: {topic.memo}</p> : null}
        <div className="mt-4">
          <TrendActions
            topicId={topic.id}
            trendCollectionEnabled={isTrendCollectionConfigured()}
            candidateCount={topic.trendCandidates.length}
            initialAutoScoutRunId={latestAutoScoutRun?.id ?? null}
          />
        </div>
        <div className="mt-3">
          <Link href={`/topics/${topic.id}/community`} className="btn">
            Community Radar 수동 소스 입력
          </Link>
        </div>
      </header>

      <section className="glass-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="section-title">Auto Scout 상태</h2>
            <p className="mt-1 text-sm text-slate-500">
              Topic 생성 이후 후보 생성, 점수 계산, 외부/커뮤니티 신호 수집을 승인 전 단계까지 자동으로 묶어 실행합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge">{topic.status}</span>
            <span className="badge">마지막 실행: {latestAutoScoutLog?.createdAt.toLocaleString("ko-KR", { hour12: false }) ?? "-"}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">후보</p>
            <p className="text-lg font-semibold text-slate-900">{autoScoutStats.candidates}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">외부 신호</p>
            <p className="text-lg font-semibold text-slate-900">{autoScoutStats.trendSignals}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">커뮤니티 신호</p>
            <p className="text-lg font-semibold text-slate-900">{autoScoutStats.communitySignals}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">GitHub 보강</p>
            <p className="text-lg font-semibold text-slate-900">{autoScoutStats.githubSignals}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">공식 출처</p>
            <p className="text-lg font-semibold text-slate-900">{autoScoutStats.officialSources}</p>
          </div>
        </div>
        {latestAutoScoutLog?.errorMessage ? (
          <p className="mt-3 text-sm text-amber-700">{latestAutoScoutLog.errorMessage}</p>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="glass-card px-3 py-2">
          <p className="text-xs text-slate-500">write_now</p>
          <p className="text-lg font-semibold text-emerald-700">{verdictCount.write_now}</p>
        </div>
        <div className="glass-card px-3 py-2">
          <p className="text-xs text-slate-500">review_first</p>
          <p className="text-lg font-semibold text-blue-700">{verdictCount.review_first}</p>
        </div>
        <div className="glass-card px-3 py-2">
          <p className="text-xs text-slate-500">hold</p>
          <p className="text-lg font-semibold text-amber-700">{verdictCount.hold}</p>
        </div>
        <div className="glass-card px-3 py-2">
          <p className="text-xs text-slate-500">reject</p>
          <p className="text-lg font-semibold text-rose-700">{verdictCount.reject}</p>
        </div>
        <div className="glass-card px-3 py-2">
          <p className="text-xs text-slate-500">unscored</p>
          <p className="text-lg font-semibold text-slate-700">{verdictCount.unscored}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">TrendCandidate 목록 (점수순)</h2>
            <p className="mt-1 text-sm text-slate-500">
              표 대신 카드로 정리했습니다. 핵심 판단은 상단, 보강 신호와 공식 출처는 카드 내부에 분리됩니다.
            </p>
          </div>
          <Link href="/" className="btn">
            대시보드
          </Link>
        </div>
        <div className="space-y-4">
          {topic.trendCandidates.map((candidate) => (
            <TrendCandidateCard key={candidate.id} topicId={topic.id} candidate={candidate} />
          ))}
        </div>
      </section>
    </div>
  );
}
