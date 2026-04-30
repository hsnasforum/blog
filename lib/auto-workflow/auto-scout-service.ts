import { collectCommunitySignalsForTopic, collectGitHubIssuesForCandidate } from "@/lib/community/collect-community-signals";
import { parseTrendCandidateSourceMeta } from "@/lib/community/source-meta";
import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import { collectTrendSignalsForTopic } from "@/lib/trend/collect-trend-signals";
import { isTrendCollectionConfigured } from "@/lib/trend/naver-config";
import { getGenerationMetadata, mergeGenerationMetadata } from "@/lib/writer/generation-status";
import { WriterService } from "@/lib/writer/writer-service";
import {
  getAutoGenerationStatus,
  getAutoWorkflowStatus,
  writeAutoWorkflowLog,
} from "@/lib/auto-workflow/auto-log";
import {
  appendWorkflowRunWarnings,
  ensureWorkflowRun,
  finishWorkflowRun,
  linkLatestGenerationLogToStep,
  markWorkflowStep,
} from "@/lib/auto-workflow/workflow-run-service";
import type { AutoScoutResult, AutoWorkflowStep } from "@/lib/auto-workflow/auto-workflow-types";
import type { AutoWorkflowStepStatus } from "@/lib/auto-workflow/auto-workflow-types";

const writerService = new WriterService();

function toStepStatus(status: string): AutoWorkflowStepStatus {
  if (status === "success" || status === "partial" || status === "failed") {
    return status;
  }

  return "partial";
}

function hasDcinsideBasis(candidate: {
  sourceMetaJson: string | null;
  communitySignals: Array<{ sourceType: string }>;
}) {
  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  return sourceMeta?.sourceType === "dcinside" || candidate.communitySignals.some((signal) => signal.sourceType === "dcinside");
}

async function getAutoScoutCounts(topicId: string) {
  const [candidateCount, trendSignalCount, communitySignalCount, githubSignalCount, officialSourceCount] =
    await Promise.all([
      prisma.trendCandidate.count({ where: { topicId } }),
      prisma.trendSignal.count({ where: { candidate: { topicId } } }),
      prisma.communitySignal.count({ where: { topicId } }),
      prisma.communitySignal.count({ where: { topicId, sourceType: "github_issues" } }),
      prisma.officialSource.count({ where: { candidate: { topicId } } }),
    ]);

  return {
    candidateCount,
    trendSignalCount,
    communitySignalCount,
    githubSignalCount,
    officialSourceCount,
  };
}

async function generateCandidates(topicId: string, regenerate: boolean, steps: AutoWorkflowStep[], warnings: string[]) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      blogProfile: true,
      trendCandidates: true,
    },
  });

  if (!topic) throw new Error("토픽을 찾을 수 없습니다.");
  if (topic.trendCandidates.length > 0 && !regenerate) {
    steps.push({ step: "generateCandidates", status: "skipped", message: "기존 후보를 재사용했습니다." });
    return getGenerationMetadata({ generationStatus: "success", data: null });
  }

  const profile = topic.blogProfile ?? (await ensureBlogProfile());
  const generated = await writerService.generateKeywordCandidates({
    rawTopic: topic.rawTopic,
    memo: topic.memo,
    optionalKeywords: topic.optionalKeywords,
    avoidTopics: topic.avoidTopics,
    blogProfile: profile,
  });
  const metadata = getGenerationMetadata(generated);

  await prisma.$transaction(async (tx) => {
    await tx.trendCandidate.deleteMany({ where: { topicId } });
    if (generated.data.length > 0) {
      await tx.trendCandidate.createMany({
        data: generated.data.map((item) => ({
          topicId,
          keyword: item.keyword,
          rationale: item.rationale,
          titleCandidates: JSON.stringify(item.titleCandidates),
          scoringBasis: "estimated_without_external_data",
        })),
      });
    }
    await tx.topic.update({
      where: { id: topicId },
      data: { status: "auto_scout_candidates_generated" },
    });
  });

  steps.push({
    step: "generateCandidates",
    status: metadata.generationStatus === "fallback" ? "partial" : "success",
    message: `${generated.data.length}개 후보 생성`,
  });
  if (metadata.generationStatus === "fallback") {
    warnings.push(metadata.fallbackReason ?? "후보 생성이 fallback으로 처리되었습니다.");
  }

  return metadata;
}

async function scoreCandidates(topicId: string, steps: AutoWorkflowStep[], warnings: string[]) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      trendCandidates: true,
      blogProfile: true,
    },
  });

  if (!topic) throw new Error("토픽을 찾을 수 없습니다.");
  if (topic.trendCandidates.length === 0) {
    steps.push({ step: "scoreCandidates", status: "failed", message: "점수 계산 대상 후보가 없습니다." });
    warnings.push("점수 계산 대상 후보가 없습니다.");
    return getGenerationMetadata({ generationStatus: "failed", data: null });
  }

  const profile = topic.blogProfile ?? (await ensureBlogProfile());
  const scoredResult = await writerService.scoreTrendCandidates({
    rawTopic: topic.rawTopic,
    memo: topic.memo,
    optionalKeywords: topic.optionalKeywords,
    avoidTopics: topic.avoidTopics,
    blogProfile: profile,
    candidates: topic.trendCandidates.map((candidate) => ({
      id: candidate.id,
      keyword: candidate.keyword,
      rationale: candidate.rationale,
      titleCandidates: candidate.titleCandidates,
      angleRecommendation: candidate.angleRecommendation,
    })),
  });
  const metadata = getGenerationMetadata(scoredResult);

  await prisma.$transaction(async (tx) => {
    for (const result of scoredResult.data) {
      await tx.trendCandidate.update({
        where: { id: result.id },
        data: {
          scoringBasis: result.scoringBasis,
          searchGrowthScore: result.searchGrowthScore,
          newsVelocityScore: result.newsVelocityScore,
          communityHeatScore: result.communityHeatScore,
          blogFitScore: result.blogFitScore,
          differentiationScore: result.differentiationScore,
          lifespanScore: result.lifespanScore,
          riskPenalty: result.riskPenalty,
          totalScore: result.totalScore,
          verdict: result.verdict,
          confidence: result.confidence,
          scoringVersion: result.scoringVersion,
          scoringReason: result.scoringReason,
          isRecommended: result.isRecommended,
          angleRecommendation: result.angleRecommendation,
          recommendationReason: result.recommendationReason,
        },
      });
    }
    await tx.topic.update({
      where: { id: topicId },
      data: { status: "auto_scout_scored" },
    });
  });

  steps.push({
    step: "scoreCandidates",
    status: metadata.generationStatus === "fallback" ? "partial" : "success",
    message: `${scoredResult.data.length}개 후보 점수 계산`,
  });
  if (metadata.generationStatus === "fallback") {
    warnings.push(metadata.fallbackReason ?? "점수 계산이 fallback으로 처리되었습니다.");
  }

  return metadata;
}

async function collectTrendSignals(topicId: string, steps: AutoWorkflowStep[], warnings: string[]) {
  if (!isTrendCollectionConfigured()) {
    steps.push({ step: "collectTrendSignals", status: "skipped", message: "Naver 환경변수가 없어 건너뜀" });
    warnings.push("NAVER_CLIENT_ID/SECRET이 없어 외부 트렌드 신호 수집을 건너뛰었습니다.");
    return;
  }

  const result = await collectTrendSignalsForTopic(topicId);
  if (!result.ok) {
    steps.push({ step: "collectTrendSignals", status: "partial", message: result.error });
    warnings.push(result.error);
    return;
  }

  steps.push({
    step: "collectTrendSignals",
    status: toStepStatus(result.collectionStatus),
    message: `mode=${result.mode}, signals=${result.signals.length}`,
  });
  if (result.warning) warnings.push(result.warning);
}

async function collectCommunitySignals(topicId: string, steps: AutoWorkflowStep[], warnings: string[]) {
  const result = await collectCommunitySignalsForTopic(topicId);
  if (!result.ok) {
    steps.push({ step: "collectCommunitySignals", status: "partial", message: result.error });
    warnings.push(result.error);
    return;
  }

  steps.push({
    step: "collectCommunitySignals",
    status: toStepStatus(result.collectionStatus),
    message: `signals=${result.signalCount}`,
  });
  if (result.warning) warnings.push(result.warning);
  warnings.push(...result.warnings);
}

async function boostGitHubIssues(topicId: string, steps: AutoWorkflowStep[], warnings: string[]) {
  const candidates = await prisma.trendCandidate.findMany({
    where: { topicId },
    include: {
      communitySignals: true,
    },
    orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
    take: 5,
  });
  const targets = candidates.filter(hasDcinsideBasis);

  if (targets.length === 0) {
    steps.push({ step: "boostGitHubIssues", status: "skipped", message: "DCInside 기반 후보가 없어 건너뜀" });
    return;
  }

  let signalCount = 0;
  for (const candidate of targets) {
    const result = await collectGitHubIssuesForCandidate(topicId, candidate.id);
    if (!result.ok) {
      warnings.push(result.error);
      continue;
    }
    signalCount += result.signalCount;
    if (result.warning) warnings.push(result.warning);
    warnings.push(...result.warnings);
  }

  steps.push({
    step: "boostGitHubIssues",
    status: signalCount > 0 ? "success" : "partial",
    message: `signals=${signalCount}`,
  });
}

export async function runAutoScoutForTopic(
  topicId: string,
  options: { regenerate?: boolean; runId?: string | null } = {},
): Promise<AutoScoutResult & { runId: string }> {
  const steps: AutoWorkflowStep[] = [];
  const warnings: string[] = [];
  let currentWorkflowStep: string | null = null;
  const workflowRun = await ensureWorkflowRun({
    runId: options.runId,
    runType: "auto_scout",
    topicId,
  });
  const runId = workflowRun.id;

  try {
    currentWorkflowStep = "load_topic";
    await markWorkflowStep(runId, "load_topic", "running");
    const topicExists = await prisma.topic.findUnique({ where: { id: topicId }, select: { id: true } });
    if (!topicExists) throw new Error("토픽을 찾을 수 없습니다.");
    await markWorkflowStep(runId, "load_topic", "success", { message: "Topic 확인 완료" });

    currentWorkflowStep = "generate_candidates";
    await markWorkflowStep(runId, "generate_candidates", "running");
    const generateStartedAt = new Date();
    const candidateMetadata = await generateCandidates(topicId, Boolean(options.regenerate), steps, warnings);
    const generateLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "generate_candidates",
      action: "generateKeywordCandidates",
      since: generateStartedAt,
    });
    await markWorkflowStep(runId, "generate_candidates", candidateMetadata.generationStatus === "failed" ? "failed" : "success", {
      message: steps.find((step) => step.step === "generateCandidates")?.message ?? null,
      errorMessage: candidateMetadata.generationStatus === "failed" ? "후보 생성 실패" : null,
      generationLogId: generateLogId,
    });

    currentWorkflowStep = "score_candidates";
    await markWorkflowStep(runId, "score_candidates", "running");
    const scoreStartedAt = new Date();
    const scoreMetadata = await scoreCandidates(topicId, steps, warnings);
    const scoreLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "score_candidates",
      action: "scoreTrendCandidates",
      since: scoreStartedAt,
    });
    await markWorkflowStep(runId, "score_candidates", scoreMetadata.generationStatus === "failed" ? "failed" : "success", {
      message: steps.find((step) => step.step === "scoreCandidates")?.message ?? null,
      errorMessage: scoreMetadata.generationStatus === "failed" ? "점수 계산 실패" : null,
      generationLogId: scoreLogId,
    });

    const generationMetadata = mergeGenerationMetadata([candidateMetadata, scoreMetadata]);

    currentWorkflowStep = "collect_trend_signals";
    await markWorkflowStep(runId, "collect_trend_signals", "running");
    const trendStartedAt = new Date();
    await collectTrendSignals(topicId, steps, warnings);
    const trendLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "collect_trend_signals",
      action: "collectTrendSignals",
      since: trendStartedAt,
    });
    await markWorkflowStep(runId, "collect_trend_signals", steps.find((step) => step.step === "collectTrendSignals")?.status === "failed" ? "failed" : "success", {
      message: steps.find((step) => step.step === "collectTrendSignals")?.message ?? null,
      generationLogId: trendLogId,
    });

    currentWorkflowStep = "collect_community_signals";
    await markWorkflowStep(runId, "collect_community_signals", "running");
    const communityStartedAt = new Date();
    await collectCommunitySignals(topicId, steps, warnings);
    const communityLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "collect_community_signals",
      action: "collectCommunitySignals",
      since: communityStartedAt,
    });
    await markWorkflowStep(runId, "collect_community_signals", steps.find((step) => step.step === "collectCommunitySignals")?.status === "failed" ? "failed" : "success", {
      message: steps.find((step) => step.step === "collectCommunitySignals")?.message ?? null,
      generationLogId: communityLogId,
    });

    currentWorkflowStep = "boost_github_issues";
    await markWorkflowStep(runId, "boost_github_issues", "running");
    const githubStartedAt = new Date();
    await boostGitHubIssues(topicId, steps, warnings);
    const githubLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "boost_github_issues",
      action: "collectGitHubIssuesForCandidate",
      since: githubStartedAt,
    });
    await markWorkflowStep(runId, "boost_github_issues", "success", {
      message: steps.find((step) => step.step === "boostGitHubIssues")?.message ?? null,
      generationLogId: githubLogId,
    });

    currentWorkflowStep = "finalize_scout";
    await markWorkflowStep(runId, "finalize_scout", "running");
    const status = getAutoWorkflowStatus(steps);
    const counts = await getAutoScoutCounts(topicId);
    await prisma.topic.update({
      where: { id: topicId },
      data: { status: status === "success" ? "auto_scout_success" : status === "partial" ? "auto_scout_partial" : "auto_scout_failed" },
    });
    await writeAutoWorkflowLog({
      action: "autoScout",
      inputSummary: `topicId=${topicId}, regenerate=${Boolean(options.regenerate)}`,
      steps,
      warnings,
    });
    await appendWorkflowRunWarnings(runId, warnings);
    await markWorkflowStep(runId, "finalize_scout", "success", { message: `${counts.candidateCount}개 후보 정렬 완료` });
    await finishWorkflowRun({
      runId,
      status,
      warnings,
      result: {
        topicId,
        ...counts,
        completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      },
    });

    return {
      ok: true,
      runId,
      topicId,
      status,
      generationStatus:
        generationMetadata.generationStatus === "fallback" ? "partial" : getAutoGenerationStatus(status),
      completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      steps,
      ...counts,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    steps.push({ step: "autoScout", status: "failed", message });
    warnings.push(message);
    if (currentWorkflowStep) {
      await markWorkflowStep(runId, currentWorkflowStep, "failed", { errorMessage: message }).catch(() => undefined);
    }
    await prisma.topic.update({
      where: { id: topicId },
      data: { status: "auto_scout_failed" },
    }).catch(() => undefined);
    await writeAutoWorkflowLog({
      action: "autoScout",
      inputSummary: `topicId=${topicId}, regenerate=${Boolean(options.regenerate)}`,
      steps,
      warnings,
    });
    const counts = await getAutoScoutCounts(topicId).catch(() => ({
      candidateCount: 0,
      trendSignalCount: 0,
      communitySignalCount: 0,
      githubSignalCount: 0,
      officialSourceCount: 0,
    }));

    await finishWorkflowRun({
      runId,
      status: "failed",
      warnings,
      errorMessage: message,
      result: { topicId, ...counts },
    }).catch(() => undefined);

    return {
      ok: true,
      runId,
      topicId,
      status: "failed",
      generationStatus: "failed",
      completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      steps,
      ...counts,
      warnings,
    };
  }
}
