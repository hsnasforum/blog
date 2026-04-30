import type { Prisma } from "@prisma/client";

import { AutoDraftButton } from "@/components/auto-draft-button";
import { CreatePostButton } from "@/components/create-post-button";
import { GitHubIssuesCollectButton } from "@/components/github-issues-collect-button";
import { OfficialSourceForm } from "@/components/official-source-form";
import { COMMUNITY_SOURCE_META_WARNING, parseTrendCandidateSourceMeta } from "@/lib/community/source-meta";
import {
  OFFICIAL_SOURCE_NOTICE,
  officialSourceTypeLabels,
  officialVerificationStatusLabels,
  officialWriteNowRules,
  type OfficialSourceType,
  type OfficialVerificationStatus,
} from "@/lib/official-source/official-source-types";

type TrendCandidateCardCandidate = Prisma.TrendCandidateGetPayload<{
  include: {
    trendSignals: true;
    communitySignals: true;
    officialSources: true;
    workflowRuns: true;
    posts: true;
  };
}>;

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

function scoreTone(totalScore: number | null) {
  if (totalScore === null) return "text-slate-500";
  if (totalScore >= 80) return "text-emerald-700";
  if (totalScore >= 65) return "text-blue-700";
  if (totalScore >= 50) return "text-amber-700";
  return "text-rose-700";
}

function verdictBadgeClass(verdict: string | null) {
  if (verdict === "write_now") return "badge-success";
  if (verdict === "review_first") return "badge-accent";
  if (verdict === "hold") return "badge-warning";
  if (verdict === "reject") return "badge-danger";
  return "";
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
  if (scoringBasis === "community_unverified") return "커뮤니티 조기 신호";
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

function parseCommunityRawMeta(raw: string | null): {
  repository?: string;
  issueNumber?: number;
  updatedAt?: string;
  searchQuery?: string;
  matchedQueries?: string[];
  relevanceScore?: number;
} {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    return {
      repository: record.repository ? String(record.repository) : undefined,
      issueNumber: typeof record.issueNumber === "number" ? record.issueNumber : undefined,
      updatedAt: record.updatedAt ? String(record.updatedAt) : undefined,
      searchQuery: record.searchQuery ? String(record.searchQuery) : undefined,
      matchedQueries: Array.isArray(record.matchedQueries)
        ? record.matchedQueries.map((query) => String(query)).filter(Boolean)
        : undefined,
      relevanceScore: typeof record.relevanceScore === "number" ? record.relevanceScore : undefined,
    };
  } catch {
    return {};
  }
}

function communitySourceLabel(sourceType: string) {
  if (sourceType === "manual") return "수동 입력";
  if (sourceType === "hacker_news") return "Hacker News";
  if (sourceType === "github_issues") return "GitHub Issues";
  if (sourceType === "stackexchange") return "Stack Exchange";
  if (sourceType === "reddit") return "Reddit";
  if (sourceType === "dcinside") return "DCInside";
  return sourceType;
}

function currentVerificationStatus(
  officialSources: Array<{ verificationStatus: string }>,
  sourceMetaStatus?: string | null,
) {
  if (officialSources.some((source) => source.verificationStatus === "rejected_as_rumor")) return "rejected_as_rumor";
  if (officialSources.some((source) => source.verificationStatus === "contradicted")) return "contradicted";
  if (officialSources.some((source) => source.verificationStatus === "official_confirmed")) return "official_confirmed";
  if (officialSources.some((source) => source.verificationStatus === "needs_manual_review")) return "needs_manual_review";
  return sourceMetaStatus ?? "community_only";
}

function CompactMetric({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
      {label} <span className="font-semibold text-slate-900">{value ?? "-"}</span>
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{title}</p>
      {children}
    </div>
  );
}

export function TrendCandidateCard({
  topicId,
  candidate,
}: {
  topicId: string;
  candidate: TrendCandidateCardCandidate;
}) {
  const titles = parseTitles(candidate.titleCandidates);
  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  const links = candidate.trendSignals.flatMap((signal) => parseLinks(signal.linksJson)).slice(0, 3);
  const communitySignals = candidate.communitySignals;
  const githubIssueSignals = communitySignals.filter((signal) => signal.sourceType === "github_issues");
  const communityLinks = communitySignals.slice(0, 3).map((signal) => ({
    title: signal.title,
    link: signal.url,
  }));
  const sourceCount = new Set(communitySignals.map((signal) => `${signal.sourceType}:${signal.sourceName}`)).size;
  const signalTypeSummary = Array.from(new Set(communitySignals.map((signal) => signal.signalType))).join(", ");
  const hasRumor = communitySignals.some((signal) => signal.signalType === "rumor");
  const failedSignals = candidate.trendSignals.filter((signal) => signal.status === "failed");
  const verificationStatus = currentVerificationStatus(candidate.officialSources, sourceMeta?.verificationStatus);
  const officialConfirmed = candidate.officialSources.some(
    (source) => source.verificationStatus === "official_confirmed",
  );
  const rejectedOrContradicted = candidate.officialSources.some(
    (source) => source.verificationStatus === "contradicted" || source.verificationStatus === "rejected_as_rumor",
  );
  const recentLinks = [...links, ...communityLinks].slice(0, 3);
  const canCollectGithub =
    sourceMeta?.sourceType === "dcinside" || communitySignals.some((signal) => signal.sourceType === "dcinside");
  const latestAutoDraftRun = candidate.workflowRuns[0] ?? null;

  return (
    <article className="glass-card overflow-hidden">
      <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_1.35fr]">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50">
              <span className={`text-xl font-bold ${scoreTone(candidate.totalScore)}`}>
                {candidate.totalScore ?? "-"}
              </span>
              <span className="text-[10px] text-slate-500">score</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span className={`badge ${verdictBadgeClass(candidate.verdict)}`}>
                  {verdictLabel(candidate.verdict)}
                </span>
                <span className="badge badge-warning">{scoreBasisLabel(candidate.scoringBasis)}</span>
                {candidate.confidence ? <span className="badge">confidence: {candidate.confidence}</span> : null}
                {candidate.scoringVersion ? <span className="badge">{candidate.scoringVersion}</span> : null}
              </div>
              <h3 className="text-base font-bold leading-6 text-slate-900">{candidate.keyword}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{candidate.rationale}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <CompactMetric label="SG" value={candidate.searchGrowthScore} />
            <CompactMetric label="NV" value={candidate.newsVelocityScore} />
            <CompactMetric label="CH" value={candidate.communityHeatScore} />
            <CompactMetric label="BF" value={candidate.blogFitScore} />
            <CompactMetric label="DF" value={candidate.differentiationScore} />
            <CompactMetric label="LS" value={candidate.lifespanScore} />
            <CompactMetric label="RP" value={candidate.riskPenalty} />
          </div>

          {sourceMeta ? (
            <Panel title="커뮤니티 원문">
              <div className="space-y-1 text-xs leading-5 text-slate-600">
                <p className="font-semibold text-slate-900">
                  {sourceMeta.sourceName}
                  {sourceMeta.sourceTab ? ` · ${sourceMeta.sourceTab}` : ""}
                </p>
                {sourceMeta.signalTitle ? <p>{sourceMeta.signalTitle}</p> : null}
                <div className="flex flex-wrap gap-1">
                  <span className="badge badge-warning">risk: {sourceMeta.riskLevel ?? "-"}</span>
                  <span className="badge">verification: {sourceMeta.verificationStatus ?? "-"}</span>
                </div>
                {sourceMeta.signalUrl ? (
                  <a href={sourceMeta.signalUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    원문 링크 열기
                  </a>
                ) : null}
                <p className="font-medium text-amber-700">{COMMUNITY_SOURCE_META_WARNING}</p>
              </div>
            </Panel>
          ) : null}

          <Panel title="추천 방향">
            <p className="text-sm leading-6 text-slate-700">{candidate.angleRecommendation ?? "-"}</p>
            {candidate.recommendationReason ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">{candidate.recommendationReason}</p>
            ) : null}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="확인 상태">
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <p>커뮤니티: {communitySignals.length > 0 ? "있음" : "없음"}</p>
                <p>GitHub: {githubIssueSignals.length > 0 ? "있음" : "없음"}</p>
                <p>공식 출처: {candidate.officialSources.length > 0 ? "있음" : "없음"}</p>
                <p>verdict: {candidate.verdict ?? "unscored"}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {officialConfirmed ? <span className="badge badge-success">공식 출처 확인됨</span> : null}
                {rejectedOrContradicted ? <span className="badge badge-danger">반박/루머 처리됨</span> : null}
                {!officialConfirmed && !rejectedOrContradicted ? (
                  <span className="badge badge-warning">공식 확인 전</span>
                ) : null}
                <span className="badge">{verificationStatus}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-amber-700">{OFFICIAL_SOURCE_NOTICE}</p>
            </Panel>

            <Panel title="외부/커뮤니티 신호">
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex flex-wrap gap-1">
                  {candidate.trendSignals.length > 0 ? (
                    candidate.trendSignals.map((signal) => (
                      <span
                        key={signal.id}
                        className={`badge ${signal.status === "failed" ? "badge-danger" : "badge-accent"}`}
                      >
                        {sourceLabel(signal.source)} {signal.status === "failed" ? "실패" : signal.score}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500">외부 신호 미수집</span>
                  )}
                  {communitySignals.length > 0 ? (
                    <span className="badge badge-success">Community Heat {candidate.communityHeatScore ?? "-"}</span>
                  ) : null}
                </div>
                {communitySignals.length > 0 ? (
                  <>
                    <p>출처 {sourceCount}개 · {signalTypeSummary || "signalType 없음"}</p>
                    <p>{Array.from(new Set(communitySignals.map((signal) => communitySourceLabel(signal.sourceType)))).join(", ")}</p>
                    {hasRumor ? <p className="font-medium text-rose-700">루머 가능성 warning</p> : null}
                  </>
                ) : null}
                {failedSignals.length > 0 ? (
                  <p className="text-rose-700">수집 실패: {failedSignals.map((signal) => sourceLabel(signal.source)).join(", ")}</p>
                ) : null}
                {canCollectGithub ? <GitHubIssuesCollectButton topicId={topicId} candidateId={candidate.id} /> : null}
              </div>
            </Panel>
          </div>

          {githubIssueSignals.length > 0 ? (
            <Panel title="GitHub Issues 보강 신호">
              <p className="mb-2 text-xs leading-5 text-slate-500">
                GitHub 이슈 보강 신호입니다. 공식 repo 여부와 문서/릴리즈 확인이 필요할 수 있습니다.
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                {githubIssueSignals.slice(0, 3).map((signal) => {
                  const rawMeta = parseCommunityRawMeta(signal.rawMetaJson);
                  return (
                    <div key={signal.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs leading-5">
                      <p className="font-semibold text-slate-900">
                        {rawMeta.repository ?? signal.sourceName}
                        {rawMeta.issueNumber ? ` #${rawMeta.issueNumber}` : ""}
                      </p>
                      <a href={signal.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                        {signal.title}
                      </a>
                      <p className="text-slate-500">
                        comments {signal.commentCount} / reactions {signal.reactionCount}
                      </p>
                      <p className="text-slate-500">
                        relevance {rawMeta.relevanceScore ?? "-"} · {rawMeta.updatedAt?.slice(0, 10) ?? "-"}
                      </p>
                      {rawMeta.searchQuery ? <p className="text-slate-500">검색어: {rawMeta.searchQuery}</p> : null}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
            <Panel title="추천 제목 후보">
              {titles.length > 0 ? (
                <ol className="space-y-2 text-sm leading-6 text-slate-700">
                  {titles.slice(0, 3).map((title, index) => (
                    <li key={`${candidate.id}-${index}`} className="flex gap-2">
                      <span className="text-xs font-bold text-blue-700">0{index + 1}</span>
                      <span>{title}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">제목 후보 없음</p>
              )}
            </Panel>

            <Panel title="최근 링크">
              {recentLinks.length > 0 ? (
                <ul className="space-y-2 text-xs leading-5">
                  {recentLinks.map((link, index) => (
                    <li key={`${candidate.id}-link-${index}`}>
                      <a href={link.link} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">링크 없음</p>
              )}
            </Panel>
          </div>
        </div>
      </div>

      <details className="border-t border-slate-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          공식 출처 추가 / 상세 점수 이유
        </summary>
        <div className="mt-3 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            {candidate.scoringReason ? (
              <Panel title="점수 산정 이유">
                <p className="text-sm leading-6 text-slate-700">{candidate.scoringReason}</p>
              </Panel>
            ) : null}
            <Panel title="write_now 조건">
              <ul className="space-y-1 text-xs leading-5 text-slate-600">
                {officialWriteNowRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </Panel>
            {candidate.officialSources.length > 0 ? (
              <Panel title="저장된 공식 출처">
                <div className="space-y-2 text-xs leading-5">
                  {candidate.officialSources.map((source) => (
                    <div key={source.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <span className="badge badge-accent">
                        {officialSourceTypeLabels[source.sourceType as OfficialSourceType] ?? source.sourceType}
                      </span>
                      <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block text-blue-700 underline">
                        {source.title}
                      </a>
                      <p className="text-slate-500">
                        {officialVerificationStatusLabels[source.verificationStatus as OfficialVerificationStatus] ??
                          source.verificationStatus}
                      </p>
                      {source.note ? <p className="text-slate-500">{source.note}</p> : null}
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </div>
          <OfficialSourceForm
            topicId={topicId}
            candidateId={candidate.id}
            communitySignals={communitySignals.map((signal) => ({
              id: signal.id,
              title: signal.title,
            }))}
          />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-500">
          자동 글 생성은 review 단계에서 멈춥니다. approved는 사람이 워크플로우 화면에서 직접 검토 후 처리합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <AutoDraftButton
            topicId={topicId}
            candidateId={candidate.id}
            hasPost={candidate.posts.length > 0}
            initialRunId={latestAutoDraftRun?.id ?? null}
          />
          <CreatePostButton candidateId={candidate.id} />
        </div>
      </div>
    </article>
  );
}
