import { NextResponse } from "next/server";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import {
  getGenerationMetadata,
  mergeGenerationMetadata,
} from "@/lib/writer/generation-status";
import { buildWriterSourceContext } from "@/lib/writer/source-context";
import { WriterService } from "@/lib/writer/writer-service";

const writerService = new WriterService();

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: {
        candidate: {
          include: {
            communitySignals: true,
            officialSources: true,
          },
        },
        blogProfile: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "포스트를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!post.draft) {
      return NextResponse.json({ error: "검수할 초안이 없습니다." }, { status: 400 });
    }

    const profile = post.blogProfile ?? (await ensureBlogProfile());
    const sourceContext = post.candidate ? buildWriterSourceContext(post.candidate) : null;

    const [reviewResult, seoResult] = await Promise.all([
      writerService.reviewDraft({
        post: {
          id: post.id,
          title: post.title,
          draft: post.draft,
        },
        blogProfile: profile,
        sourceContext,
      }),
      writerService.generateSeoPackage({
        post: {
          id: post.id,
          title: post.title,
          draft: post.draft,
        },
        keyword: post.candidate?.keyword ?? post.title,
        sourceContext,
      }),
    ]);
    const generationMetadata = mergeGenerationMetadata([
      getGenerationMetadata(reviewResult),
      getGenerationMetadata(seoResult),
    ]);
    const review = reviewResult.data;
    const seo = seoResult.data;

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        reviewReport: review.reviewReport,
        seoPackage: seo.seoPackage,
        workflowStep: "review",
      },
    });

    return NextResponse.json({ post: updated, ...generationMetadata });
  } catch (error) {
    return NextResponse.json(
      {
        error: "검수 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
