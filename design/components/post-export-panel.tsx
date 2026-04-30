"use client";

import { useMemo, useState } from "react";

import { buildPostExportPackage, serializePublishPackage } from "@/lib/export/post-export";

type ExportWorkflowStep = "outline" | "draft" | "review" | "approved";

type ExportPost = {
  id: string;
  title: string;
  draft: string | null;
  reviewReport: string | null;
  seoPackage: string | null;
  workflowStep: ExportWorkflowStep;
};

type CopyStatus = {
  tone: "success" | "warning" | "error";
  text: string;
};

type RichCopyResult = "rich" | "plain-html";

class EmptyCopyError extends Error {}

function hasContent(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function formatTags(tags: string[]) {
  return tags.join(", ");
}

function getMetaDescriptionWarning(metaDescription: string) {
  const length = metaDescription.trim().length;

  if (length === 0) {
    return "metaDescription이 비어 있습니다. 티스토리 입력 전 직접 확인하세요.";
  }

  if (length > 150) {
    return `metaDescription이 ${length}자입니다. 티스토리 입력 화면에서 표시 길이를 직접 확인하세요.`;
  }

  return null;
}

function assertCopyableText(value: string, message = "복사할 내용이 없습니다.") {
  if (!value.trim()) {
    throw new EmptyCopyError(message);
  }
}

async function copyText(value: string, emptyMessage?: string) {
  assertCopyableText(value, emptyMessage);
  await navigator.clipboard.writeText(value);
}

function htmlToPlainText(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function getTistoryBodyHtmlWarning(bodyHtml: string) {
  const trimmed = bodyHtml.trim();

  if (!trimmed) {
    return "티스토리 HTML 본문이 아직 없습니다. 초안을 먼저 생성하세요.";
  }

  if (/&lt;\s*(p|h2)\b[^&]*data-ke-size/i.test(trimmed)) {
    return "HTML 태그가 escaped 문자열로 보입니다. 본문 HTML 생성 상태를 다시 확인하세요.";
  }

  if (!/<(?:p|h2)\b[^>]*data-ke-size="(?:size16|size26)"/i.test(trimmed)) {
    return '티스토리 본문 HTML에 <p data-ke-size="size16"> 또는 <h2 data-ke-size="size26"> 형식이 보이지 않습니다.';
  }

  if (/<\/?script\b|<\/?iframe\b|<\/?object\b|<\/?embed\b|\son[a-z]+\s*=|javascript\s*:/i.test(trimmed)) {
    return "위험한 HTML이 감지되어 복사하지 않았습니다.";
  }

  return null;
}

async function copyRichHtml(html: string, fallbackText: string): Promise<RichCopyResult> {
  assertCopyableText(html);

  if (window.ClipboardItem && navigator.clipboard.write) {
    try {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([fallbackText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return "rich";
    } catch {
      await navigator.clipboard.writeText(html);
      return "plain-html";
    }
  }

  await navigator.clipboard.writeText(html);
  return "plain-html";
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function CopyButton({
  label,
  value,
  disabled,
  successMessage,
  emptyMessage,
  onCopied,
}: {
  label: string;
  value: string;
  disabled: boolean;
  successMessage?: string;
  emptyMessage?: string;
  onCopied: (status: CopyStatus) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        try {
          await copyText(value, emptyMessage);
          onCopied({ tone: "success", text: successMessage ?? `${label} 완료` });
        } catch (copyError) {
          if (copyError instanceof EmptyCopyError) {
            onCopied({ tone: "error", text: copyError.message });
            return;
          }
          onCopied({ tone: "error", text: "클립보드 복사에 실패했습니다." });
        }
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function DownloadButton({
  disabled,
  filename,
  content,
  type,
  children,
}: {
  disabled: boolean;
  filename: string;
  content: string;
  type: string;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!content.trim()) return;
        downloadText(filename, content, type);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <pre className="max-h-36 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
        {value || "-"}
      </pre>
    </div>
  );
}

export function PostExportPanel({ post }: { post: ExportPost }) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus | null>(null);
  const exportPackage = useMemo(() => buildPostExportPackage(post), [post]);
  const hasDraft = hasContent(post.draft);
  const hasReviewReport = hasContent(post.reviewReport);
  const exportEmphasized = post.workflowStep === "review" || post.workflowStep === "approved";
  const packageText = useMemo(() => serializePublishPackage(exportPackage), [exportPackage]);

  const tagsText = formatTags(exportPackage.tags);
  const hasSeoPackage = hasContent(post.seoPackage);
  const hasSeoTitle = hasSeoPackage && hasContent(exportPackage.seoTitle);
  const hasMetaDescription = hasSeoPackage && hasContent(exportPackage.metaDescription);
  const hasTags = hasSeoPackage && exportPackage.tags.length > 0 && hasContent(tagsText);
  const hasCompleteSeoPackage = hasSeoTitle && hasMetaDescription && hasTags;
  const hasTistoryBodyHtml = hasDraft && hasContent(exportPackage.tistory.bodyHtml);
  const draftCopyDisabled = !hasDraft;
  const seoTitleCopyDisabled = !hasDraft || !hasSeoTitle;
  const metaDescriptionCopyDisabled = !hasDraft || !hasMetaDescription;
  const tagsCopyDisabled = !hasDraft || !hasTags;
  const reviewReportCopyDisabled = !hasDraft || !hasReviewReport;
  const packageCopyDisabled = !hasDraft || !hasReviewReport || !hasCompleteSeoPackage;
  const tistoryCopyDisabled = !hasTistoryBodyHtml;
  const metaDescriptionWarning = getMetaDescriptionWarning(exportPackage.metaDescription);
  const tistoryBodyHtmlWarning = hasDraft
    ? getTistoryBodyHtmlWarning(exportPackage.tistory.bodyHtml)
    : null;

  async function copyTistoryHtmlMode() {
    const warning = getTistoryBodyHtmlWarning(exportPackage.tistory.bodyHtml);

    if (warning) {
      setCopyStatus({ tone: "error", text: warning });
      return;
    }

    try {
      await copyText(
        exportPackage.tistory.bodyHtml,
        "티스토리 HTML 본문이 아직 없습니다. 초안을 먼저 생성하세요.",
      );
      setCopyStatus({
        tone: "success",
        text: "복사했습니다. 티스토리 HTML 모드에 붙여넣으세요.",
      });
    } catch (copyError) {
      if (copyError instanceof EmptyCopyError) {
        setCopyStatus({ tone: "error", text: copyError.message });
        return;
      }
      setCopyStatus({ tone: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  async function copyTistoryBasicMode() {
    const warning = getTistoryBodyHtmlWarning(exportPackage.tistory.bodyHtml);

    if (warning) {
      setCopyStatus({ tone: "error", text: warning });
      return;
    }

    try {
      const result = await copyRichHtml(
        exportPackage.tistory.bodyHtml,
        htmlToPlainText(exportPackage.tistory.bodyHtml),
      );

      if (result === "rich") {
        setCopyStatus({
          tone: "success",
          text: "복사했습니다. 티스토리 기본 편집 모드에 붙여넣어 렌더링을 확인하세요.",
        });
        return;
      }

      setCopyStatus({
        tone: "warning",
        text: "브라우저가 HTML 클립보드를 지원하지 않아 HTML 문자열로 복사했습니다. 티스토리 HTML 모드에 붙여넣으세요.",
      });
    } catch (copyError) {
      if (copyError instanceof EmptyCopyError) {
        setCopyStatus({ tone: "error", text: copyError.message });
        return;
      }
      setCopyStatus({ tone: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  return (
    <section
      className={`space-y-4 rounded-md border bg-white p-4 ${
        exportEmphasized ? "border-emerald-300" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Export</h2>
          <p className="mt-1 text-sm text-slate-600">
            자동 발행 없이 범용 HTML과 운영 블로그 HTML 형식의 복사/다운로드용 패키지만 생성합니다.
          </p>
        </div>
        {exportEmphasized ? (
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
            검수 이후 단계
          </span>
        ) : null}
      </div>

      {!hasDraft ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          draft가 생성되어야 내보낼 수 있습니다.
        </p>
      ) : null}

      {hasDraft && !hasReviewReport ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          검수 전 내보내기입니다. 발행 전 reviewReport 생성과 사실 확인을 먼저 권장합니다.
        </p>
      ) : null}

      {hasDraft && !hasSeoPackage ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요.
        </p>
      ) : null}

      {hasDraft && hasSeoPackage && !hasCompleteSeoPackage ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          SEO 제목, 메타 설명, 태그 중 비어 있는 항목이 있습니다. 검수 결과를 확인하세요.
        </p>
      ) : null}

      {hasDraft && metaDescriptionWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {metaDescriptionWarning}
        </p>
      ) : null}

      {hasDraft && tistoryBodyHtmlWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {tistoryBodyHtmlWarning}
        </p>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <p className="font-medium text-slate-800">티스토리 붙여넣기 도움말</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>티스토리 새 글 작성을 엽니다.</li>
          <li>편집기를 HTML 모드로 전환합니다.</li>
          <li>티스토리 HTML 모드용 복사 내용을 붙여넣습니다.</li>
          <li>기본 모드로 돌아가서 미리보기와 줄간격을 확인합니다.</li>
          <li>제목, 태그, 메타 설명은 별도로 입력합니다.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-600">
          HTML 태그가 글자로 보이면 티스토리 편집기를 HTML 모드로 전환한 뒤 붙여넣으세요.
        </p>
        <p className="mt-1 text-xs text-slate-600">
          티스토리 HTML 모드용 복사는 기본 편집 모드가 아니라 HTML 편집 모드에 붙여넣어야 합니다.
        </p>
      </div>

      {copyStatus ? (
        <p
          className={`text-sm ${
            copyStatus.tone === "success"
              ? "text-emerald-700"
              : copyStatus.tone === "warning"
                ? "text-amber-700"
                : "text-rose-600"
          }`}
        >
          {copyStatus.text}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton
          label="제목 복사"
          value={exportPackage.title}
          disabled={draftCopyDisabled}
          emptyMessage="초안을 먼저 생성하세요."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="SEO 제목 복사"
          value={exportPackage.seoTitle}
          disabled={seoTitleCopyDisabled}
          emptyMessage="SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="메타 설명 복사"
          value={exportPackage.metaDescription}
          disabled={metaDescriptionCopyDisabled}
          emptyMessage="SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="태그 복사"
          value={tagsText}
          disabled={tagsCopyDisabled}
          emptyMessage="SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="Markdown 복사"
          value={exportPackage.exportMarkdown}
          disabled={draftCopyDisabled}
          emptyMessage="복사할 내용이 없습니다."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="전체 HTML 복사"
          value={exportPackage.exportHtml}
          disabled={draftCopyDisabled}
          emptyMessage="복사할 내용이 없습니다."
          onCopied={setCopyStatus}
        />
        <button
          type="button"
          disabled={tistoryCopyDisabled}
          onClick={copyTistoryHtmlMode}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          티스토리 HTML 모드용 복사
        </button>
        <button
          type="button"
          disabled={tistoryCopyDisabled}
          onClick={copyTistoryBasicMode}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          티스토리 기본모드용 복사
        </button>
        <CopyButton
          label="검수 리포트 복사"
          value={exportPackage.reviewReport}
          disabled={reviewReportCopyDisabled}
          emptyMessage="검수 리포트가 아직 없습니다. 먼저 검수 실행을 눌러주세요."
          onCopied={setCopyStatus}
        />
        <CopyButton
          label="전체 패키지 복사"
          value={packageText}
          disabled={packageCopyDisabled}
          emptyMessage="검수 리포트 또는 SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요."
          onCopied={setCopyStatus}
        />
        <DownloadButton
          disabled={draftCopyDisabled}
          filename="post-export.md"
          content={exportPackage.exportMarkdown}
          type="text/markdown;charset=utf-8"
        >
          Markdown 다운로드
        </DownloadButton>
        <DownloadButton
          disabled={draftCopyDisabled}
          filename="post-export.html"
          content={exportPackage.exportHtml}
          type="text/html;charset=utf-8"
        >
          HTML 다운로드
        </DownloadButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReadOnlyField label="Tistory 제목" value={exportPackage.tistory.title} />
        <ReadOnlyField label="Tistory SEO title" value={exportPackage.tistory.seoTitle} />
        <ReadOnlyField label="metaDescription" value={exportPackage.tistory.metaDescription} />
        <ReadOnlyField label="tagsText" value={exportPackage.tistory.tagsText} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReadOnlyField label="Markdown Export" value={exportPackage.exportMarkdown} />
        <ReadOnlyField label="범용 HTML Export" value={exportPackage.exportHtml} />
        <ReadOnlyField label="티스토리 본문 HTML" value={exportPackage.tistory.bodyHtml} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">범용 HTML Preview</p>
        <div
          className="max-h-[520px] overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-800"
          dangerouslySetInnerHTML={{ __html: exportPackage.exportHtml }}
        />
      </div>
    </section>
  );
}
