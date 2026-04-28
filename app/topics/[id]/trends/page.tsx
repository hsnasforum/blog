import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatePostButton } from "@/components/create-post-button";
import { OfficialSourceForm } from "@/components/official-source-form";
import { TrendActions } from "@/components/trend-actions";
import { COMMUNITY_SOURCE_META_WARNING, parseTrendCandidateSourceMeta } from "@/lib/community/source-meta";
import {
  OFFICIAL_SOURCE_NOTICE,
  officialSourceTypeLabels,
  officialVerificationStatusLabels,
  type OfficialSourceType,
  type OfficialVerificationStatus,
} from "@/lib/official-source/official-source-types";
import { prisma } from "@/lib/prisma";
import { isTrendCollectionConfigured } from "@/lib/trend/naver-config";

function parseTitles(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function scoreColor(totalScore: number | null) {
  if (totalScore === null) return "text-slate-500";
  if (totalScore >= 80) return "text-emerald-700";
  if (totalScore >= 65) return "text-blue-700";
  if (totalScore >= 50) return "text-amber-700";
  return "text-rose-700";
}

function isVerdictKey(
  verdict: string | null,
): verdict is "write_now" | "review_first" | "hold" | "reject" {
  return verdict === "write_now" || verdict === "review_first" || verdict === "hold" || verdict === "reject";
}

function verdictLabel(verdict: string | null) {
  if (verdict === "write_now") return "바로 작성 추천";
  if (verdict === "review_first") return "검토 후 작성 추천";
  if (verdict === "hold") return "보류";
  if (verdict === "reject") return "제외";
  return "unscored";
}

function scoreBasisLabel(scoringBasis: string | null) {
  if (scoringBasis === "external_data") return "외부 데이터";
  if (scoringBasis === "estimated_without_external_data") return "외부 데이터 없음 / 추정 점수";
  if (scoringBasis === "community_signal") return "커뮤니티 신호";
  if (scoringBasis === "community_unverified") return "커뮤니티 조기 신호 / 공식 확인 필요";
  return "점수 미계산";
}

function sourceLabel(source: string) {
  if (source === "naver_datalab") return "Naver DataLab";
  if (source === "naver_news") return "Naver News";
  if (source === "naver_blog") return "Naver Blog";
  return source;
}

function parseLinks(raw: string | null): Array<{ title: string; link: string; pubDate?: string }> {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const links: Array<{ title: string; link: string; pubDate?: string }> = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? "").trim();
      const link = String(record.link ?? "").trim();

      if (title && link) {
        links.push({
          title,
          link,
          pubDate: record.pubDate ? String(record.pubDate) : undefined,
        });
      }
    }

    return links;
  } catch {
    return [];
  }
}

function communitySourceLabel(sourceType: string) {
  if (sourceType === "manual") return "수동 입력 출처";
  if (sourceType === "hacker_news") return "Hacker News";
  if (sourceType === "github_issues") return "GitHub Issues";
  if (sourceType === "stackexchange") return "Stack Exchange";
  if (sourceType === "reddit") return "Reddit";
  return sourceType;
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

  return (
    <div className="space-y-4">
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">Trend Scout</h1>
        <p className="mt-1 text-sm text-slate-600">
          rawTopic: <span className="font-medium text-slate-800">{topic.rawTopic}</span>
        </p>
        {topic.memo ? <p className="mt-1 text-sm text-slate-600">memo: {topic.memo}</p> : null}
        <div className="mt-4">
          <TrendActions topicId={topic.id} trendCollectionEnabled={isTrendCollectionConfigured()} />
        </div>
        <div className="mt-3">
          <Link
            href={`/topics/${topic.id}/community`}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            Community Radar 수동 소스 입력
          </Link>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-5">
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-500">write_now</p>
          <p className="text-lg font-semibold text-emerald-700">{verdictCount.write_now}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-500">review_first</p>
          <p className="text-lg font-semibold text-blue-700">{verdictCount.review_first}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-500">hold</p>
          <p className="text-lg font-semibold text-amber-700">{verdictCount.hold}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-500">reject</p>
          <p className="text-lg font-semibold text-rose-700">{verdictCount.reject}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs text-slate-500">unscored</p>
          <p className="text-lg font-semibold text-slate-700">{verdictCount.unscored}</p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">TrendCandidate 목록 (점수순)</h2>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            대시보드
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">keyword</th>
                <th className="px-2 py-2">rationale</th>
                <th className="px-2 py-2">score</th>
                <th className="px-2 py-2">verdict</th>
                <th className="px-2 py-2">외부 신호</th>
                <th className="px-2 py-2">Community Heat</th>
                <th className="px-2 py-2">최근 링크</th>
                <th className="px-2 py-2">추천 글 방향</th>
                <th className="px-2 py-2">추천 제목 후보</th>
                <th className="px-2 py-2">기획안</th>
              </tr>
            </thead>
            <tbody>
              {topic.trendCandidates.map((candidate) => {
                const titles = parseTitles(candidate.titleCandidates);
                const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
                const signals = candidate.trendSignals;
                const links = signals.flatMap((signal) => parseLinks(signal.linksJson)).slice(0, 3);
                const communitySignals = candidate.communitySignals;
                const communityLinks = communitySignals.slice(0, 3).map((signal) => ({
                  title: signal.title,
                  link: signal.url,
                }));
                const sourceCount = new Set(
                  communitySignals.map((signal) => `${signal.sourceType}:${signal.sourceName}`),
                ).size;
                const signalTypeSummary = Array.from(
                  new Set(communitySignals.map((signal) => signal.signalType)),
                ).join(", ");
                const hasRumor = communitySignals.some((signal) => signal.signalType === "rumor");
                const hasManual = communitySignals.some((signal) => signal.sourceType === "manual");
                const failedSignals = signals.filter((signal) => signal.status === "failed");
                const officialConfirmed = candidate.officialSources.some(
                  (source) => source.verificationStatus === "official_confirmed",
                );
                const rejectedOrContradicted = candidate.officialSources.some(
                  (source) =>
                    source.verificationStatus === "contradicted" ||
                    source.verificationStatus === "rejected_as_rumor",
                );
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <p className="font-medium text-slate-900">{candidate.keyword}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {scoreBasisLabel(candidate.scoringBasis)}
                        </span>
                        {candidate.confidence ? (
                          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                            confidence: {candidate.confidence}
                          </span>
                        ) : null}
                        {candidate.scoringVersion ? (
                          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                            {candidate.scoringVersion}
                          </span>
                        ) : null}
                      </div>
                      {sourceMeta ? (
                        <div className="mt-2 max-w-xs rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                          <p className="font-semibold">
                            출처: {sourceMeta.sourceName ?? "커뮤니티 신호"}
                            {sourceMeta.sourceTab ? ` ${sourceMeta.sourceTab}` : ""}
                          </p>
                          {sourceMeta.signalTitle ? <p>원문 제목: {sourceMeta.signalTitle}</p> : null}
                          {sourceMeta.signalUrl ? (
                            <a
                              href={sourceMeta.signalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 underline-offset-2 hover:underline"
                            >
                              원문 링크
                            </a>
                          ) : null}
                          <p>
                            verificationStatus: {sourceMeta.verificationStatus ?? "-"} / riskLevel:{" "}
                            {sourceMeta.riskLevel ?? "-"}
                          </p>
                          <p className="font-medium">
                            {COMMUNITY_SOURCE_META_WARNING}
                          </p>
                        </div>
                      ) : null}
                      <div className="mt-2 max-w-xs rounded-md border border-slate-200 bg-white p-2 text-xs leading-5 text-slate-700">
                        <div className="flex flex-wrap gap-1">
                          {officialConfirmed ? (
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                              공식 출처 확인됨
                            </span>
                          ) : null}
                          {rejectedOrContradicted ? (
                            <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700">
                              반박/루머 처리됨
                            </span>
                          ) : null}
                          {!officialConfirmed && !rejectedOrContradicted ? (
                            <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                              공식 확인 전
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 font-medium">{OFFICIAL_SOURCE_NOTICE}</p>
                        {candidate.officialSources.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {candidate.officialSources.map((source) => (
                              <div key={source.id} className="rounded border border-slate-100 bg-slate-50 p-1">
                                <p className="font-medium">
                                  {officialSourceTypeLabels[source.sourceType as OfficialSourceType] ?? source.sourceType}
                                </p>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-700 underline-offset-2 hover:underline"
                                >
                                  {source.title}
                                </a>
                                <p>
                                  {officialVerificationStatusLabels[
                                    source.verificationStatus as OfficialVerificationStatus
                                  ] ?? source.verificationStatus}
                                </p>
                                {source.note ? <p className="text-slate-500">{source.note}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <OfficialSourceForm
                          topicId={topic.id}
                          candidateId={candidate.id}
                          communitySignals={communitySignals.map((signal) => ({
                            id: signal.id,
                            title: signal.title,
                          }))}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-700">{candidate.rationale}</td>
                    <td className={`px-2 py-2 font-semibold ${scoreColor(candidate.totalScore)}`}>
                      {candidate.totalScore ?? "-"}
                      <p className="mt-1 text-xs text-slate-500">
                        SG {candidate.searchGrowthScore ?? "-"} / NV {candidate.newsVelocityScore ?? "-"} / CH{" "}
                        {candidate.communityHeatScore ?? "-"} / BF {candidate.blogFitScore ?? "-"} / DF{" "}
                        {candidate.differentiationScore ?? "-"} / LS {candidate.lifespanScore ?? "-"} / RP{" "}
                        {candidate.riskPenalty ?? "-"}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      <span className="font-medium">{verdictLabel(candidate.verdict)}</span>
                      <p className="mt-1 text-xs text-slate-500">{candidate.verdict ?? "unscored"}</p>
                      {candidate.recommendationReason ? (
                        <p className="mt-1 text-xs text-slate-500">{candidate.recommendationReason}</p>
                      ) : null}
                      {candidate.scoringReason ? (
                        <p className="mt-2 max-w-xs text-xs leading-5 text-slate-600">{candidate.scoringReason}</p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {signals.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            {signals.map((signal) => (
                              <span
                                key={signal.id}
                                className={`rounded border px-1.5 py-0.5 ${
                                  signal.status === "failed"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : "border-blue-200 bg-blue-50 text-blue-700"
                                }`}
                              >
                                {sourceLabel(signal.source)} {signal.status === "failed" ? "수집 실패" : signal.score}
                              </span>
                            ))}
                          </div>
                          {candidate.scoringBasis === "external_data" ? (
                            <p className="text-blue-700">외부 데이터 기반</p>
                          ) : (
                            <p className="text-amber-700">추정 점수</p>
                          )}
                          {failedSignals.length > 0 ? (
                            <p className="text-rose-600">
                              수집 실패: {failedSignals.map((signal) => sourceLabel(signal.source)).join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">미수집</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {communitySignals.length > 0 ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                              Community Heat {candidate.communityHeatScore ?? "-"}
                            </span>
                            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">
                              출처 {sourceCount}개
                            </span>
                          </div>
                          <p>{signalTypeSummary || "signalType 없음"}</p>
                          <p className="text-emerald-700">
                            {hasManual ? "수동 입력 출처 포함" : "사용자 의견 확인됨"}
                          </p>
                          <p className="text-slate-500">
                            {Array.from(new Set(communitySignals.map((signal) => communitySourceLabel(signal.sourceType)))).join(", ")}
                          </p>
                          {hasRumor ? <p className="font-medium text-rose-600">루머 가능성 warning</p> : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">미수집</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {[...links, ...communityLinks].slice(0, 3).length > 0 ? (
                        <ul className="max-w-xs space-y-1">
                          {[...links, ...communityLinks].slice(0, 3).map((link, index) => (
                            <li key={`${candidate.id}-link-${index}`}>
                              <a
                                href={link.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-700 underline-offset-2 hover:underline"
                              >
                                {link.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">링크 없음</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {candidate.angleRecommendation ?? "-"}
                    </td>
                    <td className="px-2 py-2 text-slate-700">
                      {titles.length > 0 ? (
                        <ul className="space-y-1 text-xs">
                          {titles.map((title, index) => (
                            <li key={`${candidate.id}-${index}`}>{title}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-400">없음</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <CreatePostButton candidateId={candidate.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
