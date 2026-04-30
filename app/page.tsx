import Link from "next/link";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import { ensureProviderConfig } from "@/lib/writer/provider-settings";

export const dynamic = "force-dynamic";

function scoreColor(totalScore: number | null) {
  if (totalScore === null) return "text-slate-500";
  if (totalScore >= 80) return "text-emerald-700";
  if (totalScore >= 65) return "text-blue-700";
  if (totalScore >= 50) return "text-amber-700";
  return "text-rose-700";
}

function scoreBasisLabel(scoringBasis: string | null) {
  if (scoringBasis === "external_data") return "외부 데이터";
  if (scoringBasis === "estimated_without_external_data") return "추정 점수";
  return "미계산";
}

export default async function Home() {
  const profile = await ensureBlogProfile();
  const providerConfigPromise = ensureProviderConfig();
  const [topics, topCandidates, posts, logs, providerConfig] = await Promise.all([
    prisma.topic.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        _count: { select: { trendCandidates: true, posts: true } },
      },
    }),
    prisma.trendCandidate.findMany({
      orderBy: [{ totalScore: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: { topic: true },
    }),
    prisma.post.findMany({
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { topic: true },
    }),
    prisma.generationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    providerConfigPromise,
  ]);
  const stats = {
    topics: topics.length,
    reviewFirst: topCandidates.filter((candidate) => candidate.verdict === "review_first").length,
    inProgress: posts.filter((post) => post.workflowStep !== "approved").length,
    approved: posts.filter((post) => post.workflowStep === "approved").length,
  };

  return (
    <div className="space-y-6">
      <section className="hero-card p-6 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="badge badge-accent">활성 워크스페이스</span>
              <span className="badge">{providerConfig?.provider ?? "미동기화"} · {providerConfig?.model ?? "n/a"}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
              {profile.blogName} 글감 운영 대시보드
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              토픽 입력, Trend Scout, 커뮤니티 신호, 초안, 검수, 티스토리 Export까지
              사람 승인 중심으로 이어지는 로컬 작성 콘솔입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/topics/new" className="btn btn-primary">
              새 토픽 만들기
            </Link>
            <Link href="/topics/ideas" className="btn">
              추천 칼럼
            </Link>
            <Link href="/settings/provider" className="btn">
              Provider 확인
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">활성 토픽</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.topics}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">검토 후 작성 후보</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{stats.reviewFirst}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">작업 중 초안</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.inProgress}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">승인 완료</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.approved}</p>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Topic 상태</h2>
          <Link
            href="/topics/new"
            className="btn"
          >
            새 토픽 입력
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">rawTopic</th>
                <th className="px-2 py-2">status</th>
                <th className="px-2 py-2">candidates</th>
                <th className="px-2 py-2">posts</th>
                <th className="px-2 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{topic.rawTopic}</td>
                  <td className="px-2 py-2 text-slate-700">{topic.status}</td>
                  <td className="px-2 py-2 text-slate-700">{topic._count.trendCandidates}</td>
                  <td className="px-2 py-2 text-slate-700">{topic._count.posts}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/topics/${topic.id}/trends`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Trend Scout
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title mb-3">
          TrendCandidate 상위 점수 (점수순)
        </h2>
        <div className="overflow-x-auto">
          <table className="data-table text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">keyword</th>
                <th className="px-2 py-2">topic</th>
                <th className="px-2 py-2">totalScore</th>
                <th className="px-2 py-2">verdict</th>
                <th className="px-2 py-2">basis</th>
              </tr>
            </thead>
            <tbody>
              {topCandidates.map((candidate) => (
                <tr key={candidate.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{candidate.keyword}</td>
                  <td className="px-2 py-2 text-slate-700">{candidate.topic.rawTopic}</td>
                  <td className={`px-2 py-2 font-semibold ${scoreColor(candidate.totalScore)}`}>
                    {candidate.totalScore ?? "-"}
                  </td>
                  <td className="px-2 py-2 text-slate-700">{candidate.verdict ?? "-"}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {scoreBasisLabel(candidate.scoringBasis)}
                    {candidate.confidence ? <span> · {candidate.confidence}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title mb-3">Post 워크플로우</h2>
        <div className="overflow-x-auto">
          <table className="data-table text-left">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">title</th>
                <th className="px-2 py-2">topic</th>
                <th className="px-2 py-2">step</th>
                <th className="px-2 py-2">updatedAt</th>
                <th className="px-2 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-900">{post.title}</td>
                  <td className="px-2 py-2 text-slate-700">{post.topic.rawTopic}</td>
                  <td className="px-2 py-2 text-slate-700">{post.workflowStep}</td>
                  <td className="px-2 py-2 text-slate-700">
                    {post.updatedAt.toLocaleString("ko-KR", { hour12: false })}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/posts/${post.id}/workflow`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      워크플로우 열기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="section-title mb-3">GenerationLog 최근 기록</h2>
        <ul className="space-y-2 text-sm">
          {logs.map((log) => (
            <li key={log.id} className="rounded-md border border-slate-200 px-3 py-2">
              <p className="font-medium text-slate-900">
                {log.action} / {log.status}
              </p>
              <p className="text-xs text-slate-600">
                {log.provider} · {log.model} · {log.createdAt.toLocaleString("ko-KR", { hour12: false })}
              </p>
              <p className="mt-1 text-xs text-slate-600">input: {log.inputSummary}</p>
              {log.outputSummary ? <p className="text-xs text-slate-600">output: {log.outputSummary}</p> : null}
              {log.errorMessage ? <p className="text-xs text-rose-600">error: {log.errorMessage}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
