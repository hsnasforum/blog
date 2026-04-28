export type ExportFormat = "markdown" | "html" | "tistory" | "package";

export type ExportPostInput = {
  id?: string;
  title: string;
  draft: string | null;
  reviewReport: string | null;
  seoPackage: string | null;
  workflowStep?: string | null;
};

export type ParsedSeoPackage = {
  seoTitle: string;
  metaDescription: string;
  tags: string[];
};

export type TistoryExport = {
  title: string;
  seoTitle: string;
  bodyHtml: string;
  metaDescription: string;
  tags: string[];
  tagsText: string;
  reviewReportText: string;
};

export type PublishPackage = {
  title: string;
  seoTitle: string;
  metaDescription: string;
  tags: string[];
  draftContent: string;
  reviewReport: string;
  exportHtml: string;
  exportMarkdown: string;
  tistory: TistoryExport;
};
