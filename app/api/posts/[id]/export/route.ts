import { NextResponse } from "next/server";

import { buildPostExportPackage } from "@/lib/export/post-export";
import type { ExportFormat } from "@/lib/export/export-types";
import { prisma } from "@/lib/prisma";

const exportFormats: ExportFormat[] = ["markdown", "html", "tistory", "package"];

function isExportFormat(value: string | null): value is ExportFormat {
  return exportFormats.includes(value as ExportFormat);
}

function hasContent(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "package";

  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: "지원하지 않는 export format입니다." },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      draft: true,
      reviewReport: true,
      seoPackage: true,
      workflowStep: true,
    },
  });

  if (!post) {
    return NextResponse.json({ error: "포스트를 찾을 수 없습니다." }, { status: 404 });
  }

  if (!hasContent(post.draft)) {
    return NextResponse.json(
      { error: "draft가 생성되어야 내보낼 수 있습니다." },
      { status: 400 },
    );
  }

  const exportPackage = buildPostExportPackage(post);

  if (format === "markdown") {
    return NextResponse.json({
      format,
      title: exportPackage.title,
      content: exportPackage.exportMarkdown,
    });
  }

  if (format === "html") {
    return NextResponse.json({
      format,
      title: exportPackage.title,
      content: exportPackage.exportHtml,
    });
  }

  if (format === "tistory") {
    return NextResponse.json({
      format,
      ...exportPackage.tistory,
    });
  }

  return NextResponse.json({
    format,
    package: exportPackage,
  });
}
