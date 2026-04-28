import type { ExportPostInput, PublishPackage } from "@/lib/export/export-types";
import { markdownToSafeHtml } from "@/lib/export/markdown-to-html";
import { parseSeoPackage } from "@/lib/export/seo-package";
import { stripDangerousHtml } from "@/lib/export/sanitize-html";
import { markdownToTistoryHtml } from "@/lib/export/tistory-html";

function normalizeDraftContent(draft: string | null | undefined) {
  return stripDangerousHtml(draft ?? "").trim();
}

function buildMarkdown(params: {
  title: string;
  seoTitle: string;
  metaDescription: string;
  tags: string[];
  draftContent: string;
}) {
  const header = [
    `# ${params.title}`,
    "",
    `SEO title: ${params.seoTitle}`,
    `Meta description: ${params.metaDescription || "-"}`,
    `Tags: ${params.tags.length > 0 ? params.tags.join(", ") : "-"}`,
    "",
    "---",
    "",
  ];

  return `${header.join("\n")}${params.draftContent}`.trim();
}

export function buildPostExportPackage(post: ExportPostInput): PublishPackage {
  const title = post.title.trim() || "제목 없음";
  const seo = parseSeoPackage(post.seoPackage, title);
  const draftContent = normalizeDraftContent(post.draft);
  const reviewReport = post.reviewReport?.trim() ?? "";
  const tagsText = seo.tags.join(", ");
  const bodyHtml = markdownToSafeHtml(draftContent);
  const tistoryBodyHtml = markdownToTistoryHtml(draftContent);
  const exportHtml = `<article>\n${bodyHtml}\n</article>`;
  const exportMarkdown = buildMarkdown({
    title,
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    tags: seo.tags,
    draftContent,
  });

  return {
    title,
    seoTitle: seo.seoTitle,
    metaDescription: seo.metaDescription,
    tags: seo.tags,
    draftContent,
    reviewReport,
    exportHtml,
    exportMarkdown,
    tistory: {
      title,
      seoTitle: seo.seoTitle,
      bodyHtml: tistoryBodyHtml,
      metaDescription: seo.metaDescription,
      tags: seo.tags,
      tagsText,
      reviewReportText: reviewReport,
    },
  };
}

export function serializePublishPackage(exportPackage: PublishPackage) {
  return JSON.stringify(exportPackage, null, 2);
}
