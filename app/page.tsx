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

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-600">
          토픽 입력 → Trend Scout → 기획안/초안/검수 → 승인 단계까지 상태를 한 화면에서 확인합니다.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">BlogProfile</p>
            <p className="text-sm font-medium text-slate-900">{profile.blogName}</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Provider</p>
            <p className="text-sm font-medium text-slate-900">
              {providerConfig?.provider ?? "미동기화"} ({providerConfig?.mode ?? "n/a"})
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Model</p>
            <p className="text-sm font-medium text-slate-900">{providerConfig?.model ?? "n/a"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Topic 상태</h2>
          <Link
            href="/topics/new"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            새 토픽 입력
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
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

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          TrendCandidate 상위 점수 (점수순)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
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

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Post 워크플로우</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
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

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">GenerationLog 최근 기록</h2>
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
