import { ensureBlogProfile } from "@/lib/blog-profile";
import {
  getAutoGenerationStatus,
  getAutoWorkflowStatus,
  writeAutoWorkflowLog,
} from "@/lib/auto-workflow/auto-log";
import type { AutoDraftResult, AutoWorkflowStep } from "@/lib/auto-workflow/auto-workflow-types";
import {
  appendWorkflowRunWarnings,
  attachWorkflowRunPost,
  ensureWorkflowRun,
  finishWorkflowRun,
  linkLatestGenerationLogToStep,
  markWorkflowStep,
} from "@/lib/auto-workflow/workflow-run-service";
import { buildPostExportPackage } from "@/lib/export/post-export";
import { prisma } from "@/lib/prisma";
import {
  getGenerationMetadata,
  mergeGenerationMetadata,
} from "@/lib/writer/generation-status";
import { buildWriterSourceContext } from "@/lib/writer/source-context";
import { WriterService } from "@/lib/writer/writer-service";

const writerService = new WriterService();

function hasReviewReadyPost(post: {
  outline: string | null;
  draft: string | null;
  reviewReport: string | null;
  seoPackage: string | null;
}) {
  return Boolean(post.outline && post.draft && post.reviewReport && post.seoPackage);
}

async function loadCandidate(topicId: string, candidateId: string) {
  const candidate = await prisma.trendCandidate.findUnique({
    where: { id: candidateId },
    include: {
      topic: {
        include: {
          blogProfile: true,
        },
      },
      communitySignals: true,
      officialSources: true,
      posts: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!candidate || candidate.topicId !== topicId) return null;
  return candidate;
}

function workflowStatusFromGeneration(generationStatus: string) {
  return generationStatus === "failed" ? "failed" : "success";
}

export async function runAutoDraftForCandidate(
  topicId: string,
  candidateId: string,
  options: { regenerate?: boolean; runId?: string | null } = {},
): Promise<AutoDraftResult & { runId: string }> {
  const steps: AutoWorkflowStep[] = [];
  const warnings: string[] = [];
  let currentWorkflowStep: string | null = null;
  const workflowRun = await ensureWorkflowRun({
    runId: options.runId,
    runType: "auto_draft",
    topicId,
    candidateId,
  });
  const runId = workflowRun.id;

  try {
    currentWorkflowStep = "load_candidate";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const candidate = await loadCandidate(topicId, candidateId);
    if (!candidate) throw new Error("해당 토픽의 후보를 찾을 수 없습니다.");
    await markWorkflowStep(runId, currentWorkflowStep, "success", { message: candidate.keyword });

    const existingPost = candidate.posts[0] ?? null;
    if (existingPost && hasReviewReadyPost(existingPost) && !options.regenerate) {
      steps.push({ step: "reusePost", status: "skipped", message: "이미 검수 가능한 글이 있어 재사용했습니다." });
      for (const stepKey of [
        "create_post",
        "generate_angle",
        "generate_outline",
        "generate_draft",
        "writer_editorial_pass",
        "generate_review",
        "generate_seo",
        "prepare_export",
      ]) {
        await markWorkflowStep(runId, stepKey, "skipped", { message: "기존 검수 가능 글 재사용" });
      }
      await attachWorkflowRunPost(runId, existingPost.id);
      await writeAutoWorkflowLog({
        action: "autoDraft",
        inputSummary: `topicId=${topicId}, candidateId=${candidateId}, reused=true`,
        steps,
        warnings,
      });
      await finishWorkflowRun({
        runId,
        status: "success",
        result: { topicId, candidateId, postId: existingPost.id, reused: true },
      });

      return {
        ok: true,
        runId,
        topicId,
        candidateId,
        postId: existingPost.id,
        status: "success",
        generationStatus: "success",
        completedSteps: ["reusePost"],
        steps,
        warnings,
      };
    }

    const profile = candidate.topic.blogProfile ?? (await ensureBlogProfile());
    const sourceContext = buildWriterSourceContext(candidate);

    currentWorkflowStep = "create_post";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const post = existingPost && options.regenerate
      ? await prisma.post.update({
          where: { id: existingPost.id },
          data: {
            title: candidate.keyword,
            angle: null,
            outline: null,
            draft: null,
            reviewReport: null,
            seoPackage: null,
            workflowStep: "outline",
            approvedAt: null,
          },
        })
      : await prisma.post.create({
          data: {
            topicId,
            candidateId,
            blogProfileId: profile.id,
            title: candidate.keyword,
            workflowStep: "outline",
          },
        });
    steps.push({ step: "createPost", status: "success", message: post.id });
    await attachWorkflowRunPost(runId, post.id);
    await markWorkflowStep(runId, currentWorkflowStep, "success", { message: post.id });

    currentWorkflowStep = "generate_angle";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const angleStartedAt = new Date();
    const angleResult = await writerService.generateAngle({
      rawTopic: candidate.topic.rawTopic,
      keyword: candidate.keyword,
      rationale: candidate.rationale,
      blogProfile: profile,
      sourceContext,
    });
    const angle = angleResult.data;
    const angleMetadata = getGenerationMetadata(angleResult);
    steps.push({
      step: "angle",
      status: angleMetadata.generationStatus === "fallback" ? "partial" : workflowStatusFromGeneration(angleMetadata.generationStatus),
      message: angle.title,
    });
    if (angleMetadata.generationStatus === "fallback") warnings.push(angleMetadata.fallbackReason ?? "기획안이 fallback으로 생성되었습니다.");
    const angledPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        title: angle.title,
        angle: angle.angle,
      },
    });
    await prisma.trendCandidate.update({
      where: { id: candidateId },
      data: {
        angleRecommendation: angle.reason,
        titleCandidates: JSON.stringify(angle.titleCandidates),
      },
    });
    const angleLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: currentWorkflowStep,
      action: "generateAngle",
      since: angleStartedAt,
    });
    await markWorkflowStep(runId, currentWorkflowStep, workflowStatusFromGeneration(angleMetadata.generationStatus), {
      message: angle.title,
      generationLogId: angleLogId,
    });

    currentWorkflowStep = "generate_outline";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const outlineStartedAt = new Date();
    const outlineResult = await writerService.generateOutline({
      post: {
        id: angledPost.id,
        title: angledPost.title,
        angle: angledPost.angle,
      },
      rawTopic: candidate.topic.rawTopic,
      keyword: candidate.keyword,
      blogProfile: profile,
      sourceContext,
    });
    const outline = outlineResult.data;
    const outlineMetadata = getGenerationMetadata(outlineResult);
    const outlinedPost = await prisma.post.update({
      where: { id: angledPost.id },
      data: {
        title: outline.title,
        outline: outline.outline,
        workflowStep: "outline",
      },
    });
    steps.push({
      step: "outline",
      status: outlineMetadata.generationStatus === "fallback" ? "partial" : workflowStatusFromGeneration(outlineMetadata.generationStatus),
      message: outline.title,
    });
    if (outlineMetadata.generationStatus === "fallback") warnings.push(outlineMetadata.fallbackReason ?? "개요가 fallback으로 생성되었습니다.");
    const outlineLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: currentWorkflowStep,
      action: "generateOutline",
      since: outlineStartedAt,
    });
    await markWorkflowStep(runId, currentWorkflowStep, workflowStatusFromGeneration(outlineMetadata.generationStatus), {
      message: outline.title,
      generationLogId: outlineLogId,
    });

    currentWorkflowStep = "generate_draft";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const draftStartedAt = new Date();
    const draftResult = await writerService.generateDraft({
      post: {
        id: outlinedPost.id,
        title: outlinedPost.title,
        angle: outlinedPost.angle,
        outline: outlinedPost.outline,
      },
      rawTopic: candidate.topic.rawTopic,
      keyword: candidate.keyword,
      blogProfile: profile,
      sourceContext,
    });
    const draftMetadata = getGenerationMetadata(draftResult);
    const draftedPost = await prisma.post.update({
      where: { id: outlinedPost.id },
      data: {
        draft: draftResult.data.draft,
        workflowStep: "draft",
      },
    });
    steps.push({
      step: "draft",
      status: draftMetadata.generationStatus === "fallback" ? "partial" : workflowStatusFromGeneration(draftMetadata.generationStatus),
      message: `${draftResult.data.draft.length} chars`,
    });
    if (draftMetadata.generationStatus === "fallback") warnings.push(draftMetadata.fallbackReason ?? "초안이 fallback으로 생성되었습니다.");
    const draftLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: currentWorkflowStep,
      action: "generateDraft",
      since: draftStartedAt,
    });
    const editorialLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: "writer_editorial_pass",
      action: "writer_editorial_pass",
      since: draftStartedAt,
    });
    await markWorkflowStep(runId, currentWorkflowStep, workflowStatusFromGeneration(draftMetadata.generationStatus), {
      message: `${draftResult.data.draft.length} chars`,
      generationLogId: draftLogId,
    });
    await markWorkflowStep(runId, "writer_editorial_pass", "success", {
      message: "초안 품질 패스 적용 완료",
      generationLogId: editorialLogId,
    });

    currentWorkflowStep = "generate_review";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const reviewStartedAt = new Date();
    const reviewResult = await writerService.reviewDraft({
      post: {
        id: draftedPost.id,
        title: draftedPost.title,
        draft: draftResult.data.draft,
      },
      blogProfile: profile,
      sourceContext,
    });
    const reviewMetadata = getGenerationMetadata(reviewResult);
    steps.push({
      step: "review",
      status: reviewMetadata.generationStatus === "fallback" ? "partial" : workflowStatusFromGeneration(reviewMetadata.generationStatus),
      message: `${reviewResult.data.reviewReport.length} chars`,
    });
    if (reviewMetadata.generationStatus === "fallback") warnings.push(reviewMetadata.fallbackReason ?? "검수가 fallback으로 생성되었습니다.");
    const reviewLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: currentWorkflowStep,
      action: "reviewDraft",
      since: reviewStartedAt,
    });
    await markWorkflowStep(runId, currentWorkflowStep, workflowStatusFromGeneration(reviewMetadata.generationStatus), {
      message: `${reviewResult.data.reviewReport.length} chars`,
      generationLogId: reviewLogId,
    });

    currentWorkflowStep = "generate_seo";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    const seoStartedAt = new Date();
    const seoResult = await writerService.generateSeoPackage({
      post: {
        id: draftedPost.id,
        title: draftedPost.title,
        draft: draftResult.data.draft,
      },
      keyword: candidate.keyword,
      sourceContext,
    });
    const seoMetadata = getGenerationMetadata(seoResult);
    steps.push({
      step: "seo",
      status: seoMetadata.generationStatus === "fallback" ? "partial" : workflowStatusFromGeneration(seoMetadata.generationStatus),
      message: "SEO package generated",
    });
    if (seoMetadata.generationStatus === "fallback") warnings.push(seoMetadata.fallbackReason ?? "SEO가 fallback으로 생성되었습니다.");
    const seoLogId = await linkLatestGenerationLogToStep({
      runId,
      stepKey: currentWorkflowStep,
      action: "generateSeoPackage",
      since: seoStartedAt,
    });
    await markWorkflowStep(runId, currentWorkflowStep, workflowStatusFromGeneration(seoMetadata.generationStatus), {
      message: "SEO package generated",
      generationLogId: seoLogId,
    });

    const finalPost = await prisma.post.update({
      where: { id: draftedPost.id },
      data: {
        reviewReport: reviewResult.data.reviewReport,
        seoPackage: seoResult.data.seoPackage,
        workflowStep: "review",
        approvedAt: null,
      },
    });

    currentWorkflowStep = "prepare_export";
    await markWorkflowStep(runId, currentWorkflowStep, "running");
    buildPostExportPackage(finalPost);
    steps.push({ step: "export", status: "success", message: "동적 export package 준비 완료" });
    await markWorkflowStep(runId, currentWorkflowStep, "success", { message: "동적 export package 준비 완료" });

    const status = getAutoWorkflowStatus(steps);
    const generationMetadata = mergeGenerationMetadata([
      angleMetadata,
      outlineMetadata,
      draftMetadata,
      reviewMetadata,
      seoMetadata,
    ]);
    await writeAutoWorkflowLog({
      action: "autoDraft",
      inputSummary: `topicId=${topicId}, candidateId=${candidateId}, postId=${finalPost.id}, regenerate=${Boolean(options.regenerate)}`,
      steps,
      warnings,
    });
    await appendWorkflowRunWarnings(runId, warnings);
    await finishWorkflowRun({
      runId,
      status,
      warnings,
      result: {
        topicId,
        candidateId,
        postId: finalPost.id,
        completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      },
    });

    return {
      ok: true,
      runId,
      topicId,
      candidateId,
      postId: finalPost.id,
      status,
      generationStatus: generationMetadata.generationStatus === "fallback" ? "partial" : getAutoGenerationStatus(status),
      completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      steps,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    steps.push({ step: "autoDraft", status: "failed", message });
    warnings.push(message);
    if (currentWorkflowStep) {
      await markWorkflowStep(runId, currentWorkflowStep, "failed", { errorMessage: message }).catch(() => undefined);
    }
    await writeAutoWorkflowLog({
      action: "autoDraft",
      inputSummary: `topicId=${topicId}, candidateId=${candidateId}, regenerate=${Boolean(options.regenerate)}`,
      steps,
      warnings,
    });
    await finishWorkflowRun({
      runId,
      status: "failed",
      warnings,
      errorMessage: message,
      result: { topicId, candidateId },
    }).catch(() => undefined);

    return {
      ok: true,
      runId,
      topicId,
      candidateId,
      postId: "",
      status: "failed",
      generationStatus: "failed",
      completedSteps: steps.filter((step) => step.status !== "failed").map((step) => step.step),
      failedStep: steps.find((step) => step.status === "failed")?.step,
      steps,
      warnings,
    };
  }
}
