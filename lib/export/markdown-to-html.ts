import { escapeHtml, sanitizeExportHtml, stripDangerousHtml } from "@/lib/export/sanitize-html";

type MarkdownSegment =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "code";
      language: string | null;
      content: string;
    };

function normalizeLineEndings(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n").trim();
}

function normalizeCodeLanguage(language: string | null | undefined) {
  if (!language) return null;
  const normalized = language.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(normalized) ? normalized : null;
}

function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
  const lines = normalizeLineEndings(markdown).split("\n");
  const segments: MarkdownSegment[] = [];
  const textLines: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage: string | null = null;

  function flushText() {
    if (textLines.length === 0) return;
    segments.push({
      type: "text",
      content: stripDangerousHtml(textLines.join("\n")),
    });
    textLines.splice(0, textLines.length);
  }

  function flushCode() {
    segments.push({
      type: "code",
      language: codeLanguage,
      content: codeLines.join("\n"),
    });
    codeLines = [];
    codeLanguage = null;
  }

  for (const rawLine of lines) {
    const openingFence = /^```\s*([a-zA-Z0-9_-]+)?\s*$/.exec(rawLine.trim());

    if (openingFence && codeLanguage === null) {
      flushText();
      codeLanguage = normalizeCodeLanguage(openingFence[1]) ?? "";
      continue;
    }

    if (/^```\s*$/.test(rawLine.trim()) && codeLanguage !== null) {
      flushCode();
      continue;
    }

    if (codeLanguage !== null) {
      codeLines.push(rawLine);
    } else {
      textLines.push(rawLine);
    }
  }

  if (codeLanguage !== null) {
    flushCode();
  }
  flushText();

  return segments;
}

function isListItem(line: string) {
  return /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line);
}

function cleanListItem(line: string) {
  return line.replace(/^(\s*[-*]\s+|\s*\d+\.\s+)/, "").trim();
}

function closeParagraph(paragraph: string[], html: string[]) {
  if (paragraph.length === 0) return;
  html.push(`<p>${paragraph.map((line) => escapeHtml(line)).join("<br />")}</p>`);
  paragraph.splice(0, paragraph.length);
}

function closeList(list: string[], html: string[]) {
  if (list.length === 0) return;
  html.push("<ul>");
  for (const item of list) {
    html.push(`  <li>${escapeHtml(item)}</li>`);
  }
  html.push("</ul>");
  list.splice(0, list.length);
}

function renderTextSegment(segment: string, html: string[], paragraph: string[], list: string[]) {
  const lines = segment.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      html.push(`<h3>${escapeHtml(h3[1].trim())}</h3>`);
      continue;
    }

    const h2 = /^(?:##|#)\s+(.+)$/.exec(trimmed);
    if (h2) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      html.push(`<h2>${escapeHtml(h2[1].trim())}</h2>`);
      continue;
    }

    if (isListItem(line)) {
      closeParagraph(paragraph, html);
      list.push(cleanListItem(line));
      continue;
    }

    closeList(list, html);
    paragraph.push(trimmed);
  }
}

function renderCodeSegment(segment: Extract<MarkdownSegment, { type: "code" }>, html: string[]) {
  const className = segment.language ? ` class="language-${segment.language}"` : "";
  html.push(`<pre><code${className}>${escapeHtml(segment.content)}</code></pre>`);
}

export function markdownToSafeHtml(markdown: string) {
  const segments = splitMarkdownSegments(markdown);
  const html: string[] = [];
  const paragraph: string[] = [];
  const list: string[] = [];

  for (const segment of segments) {
    if (segment.type === "text") {
      renderTextSegment(segment.content, html, paragraph, list);
      continue;
    }

    closeParagraph(paragraph, html);
    closeList(list, html);
    renderCodeSegment(segment, html);
  }

  closeParagraph(paragraph, html);
  closeList(list, html);

  return sanitizeExportHtml(html.join("\n"));
}
