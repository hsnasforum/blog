import { NextResponse } from "next/server";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import { getGenerationMetadata } from "@/lib/writer/generation-status";
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
        topic: true,
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

    if (!post.candidate) {
      return NextResponse.json({ error: "연결된 후보가 없습니다." }, { status: 400 });
    }

    const profile = post.blogProfile ?? (await ensureBlogProfile());
    const sourceContext = buildWriterSourceContext(post.candidate);

    const draftResult = await writerService.generateDraft({
      post: {
        id: post.id,
        title: post.title,
        angle: post.angle,
        outline: post.outline,
      },
      rawTopic: post.topic.rawTopic,
      keyword: post.candidate.keyword,
      blogProfile: profile,
      sourceContext,
    });
    const draft = draftResult.data;
    const generationMetadata = getGenerationMetadata(draftResult);

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        draft: draft.draft,
        workflowStep: "draft",
      },
    });

    return NextResponse.json({ post: updated, ...generationMetadata });
  } catch (error) {
    return NextResponse.json(
      {
        error: "초안 생성 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
