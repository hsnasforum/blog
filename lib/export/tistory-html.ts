import { escapeHtml, sanitizeTistoryHtml, stripDangerousHtml } from "@/lib/export/sanitize-html";

type Segment =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "code";
      language: string;
      content: string;
    };

const blockquoteStyle =
  "margin: 18px 0; padding: 12px 16px; border-left: 4px solid #c8c8c8; background: #fafafa";
const tableStyle = "width: 100%; border-collapse: collapse; border: 2px solid #8d8d8d; margin: 18px 0";
const captionStyle = "caption-side: top; text-align: left; font-weight: bold; padding-bottom: 8px";
const thStyle = "border: 1px solid #9c9c9c; padding: 10px; background: #f3f3f3; text-align: left; vertical-align: top";
const tdStyle = "border: 1px solid #9c9c9c; padding: 10px; vertical-align: top";
const preStyle = "padding: 12px; background: #f8f8f8; border: 1px solid #dddddd; overflow: auto";

function normalizeLineEndings(markdown: string) {
  return markdown.replace(/\r\n?/g, "\n").trim();
}

function normalizeCodeLanguage(language: string | null | undefined) {
  if (!language) return "text";
  const normalized = language.trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(normalized) ? normalized : "text";
}

function splitSegments(markdown: string): Segment[] {
  const lines = normalizeLineEndings(markdown).split("\n");
  const segments: Segment[] = [];
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
      language: normalizeCodeLanguage(codeLanguage),
      content: codeLines.join("\n"),
    });
    codeLines = [];
    codeLanguage = null;
  }

  for (const rawLine of lines) {
    const openingFence = /^```\s*([a-zA-Z0-9_-]+)?\s*$/.exec(rawLine.trim());

    if (openingFence && codeLanguage === null) {
      flushText();
      codeLanguage = openingFence[1] ?? "text";
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

function readAttribute(rawAttributes: string, name: string) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(rawAttributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function renderInlineText(rawValue: string) {
  const terms: string[] = [];
  const withTermTokens = rawValue.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (match, rawAttributes, rawText) => {
    const dataUi = readAttribute(String(rawAttributes), "data-ui");
    const dataNote = readAttribute(String(rawAttributes), "data-note");

    if (dataUi !== "term" || dataNote === null) {
      return match;
    }

    const token = `\u0000TERM_${terms.length}\u0000`;
    terms.push(
      `<span data-ui="term" data-note="${escapeHtml(dataNote)}">${escapeHtml(
        stripDangerousHtml(String(rawText)),
      )}</span>`,
    );
    return token;
  });

  let rendered = escapeHtml(stripDangerousHtml(withTermTokens));
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  for (let index = 0; index < terms.length; index += 1) {
    rendered = rendered.replace(`\u0000TERM_${index}\u0000`, terms[index]);
  }

  return rendered;
}

function isListItem(line: string) {
  return /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line);
}

function cleanListItem(line: string) {
  return line.replace(/^(\s*[-*]\s+|\s*\d+\.\s+)/, "").trim();
}

function isHr(line: string) {
  return /^(---|\*\*\*|___)$/.test(line.trim());
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length >= 4;
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function closeParagraph(paragraph: string[], html: string[]) {
  if (paragraph.length === 0) return;
  html.push(`<p data-ke-size="size16">${paragraph.map((line) => renderInlineText(line)).join("<br />")}</p>`);
  paragraph.splice(0, paragraph.length);
}

function closeList(list: string[], html: string[]) {
  if (list.length === 0) return;
  html.push('<ul style="list-style-type: disc;" data-ke-list-type="disc">');
  for (const item of list) {
    html.push(`<li>${renderInlineText(item)}</li>`);
  }
  html.push("</ul>");
  list.splice(0, list.length);
}

function renderBlockquote(lines: string[]) {
  const content = lines.map((line) => line.replace(/^>\s?/, "").trim()).filter(Boolean);
  const first = content[0] ?? "핵심 포인트";
  const rest = content.slice(1);
  const splitFirst = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(first);
  const title = splitFirst?.[1] ?? "핵심 포인트";
  const body = [splitFirst?.[2] ?? first, ...rest]
    .filter(Boolean)
    .map((line) => renderInlineText(line))
    .join("<br />");

  return [
    `<blockquote style="${blockquoteStyle}" data-ke-style="style1">`,
    `<p data-ke-size="size16"><b>${renderInlineText(title)}</b><br />${body}</p>`,
    "</blockquote>",
  ].join("\n");
}

function renderTable(lines: string[]) {
  const header = parseTableRow(lines[0]);
  const bodyRows = lines.slice(isTableDivider(lines[1] ?? "") ? 2 : 1).map(parseTableRow);

  const html = [`<table style="${tableStyle}" data-ke-align="alignLeft">`];
  html.push("<tr>");
  for (const cell of header) {
    html.push(`<th style="${thStyle}">${renderInlineText(cell)}</th>`);
  }
  html.push("</tr>");

  for (const row of bodyRows) {
    html.push("<tr>");
    for (const cell of row) {
      html.push(`<td style="${tdStyle}">${renderInlineText(cell)}</td>`);
    }
    html.push("</tr>");
  }

  html.push("</table>");
  return html.join("\n");
}

function renderCode(segment: Extract<Segment, { type: "code" }>) {
  return `<pre class="${segment.language}" style="${preStyle}"><code>${escapeHtml(segment.content)}</code></pre>`;
}

function renderTextSegment(segment: string, html: string[]) {
  const lines = segment.split("\n");
  const paragraph: string[] = [];
  const list: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      index += 1;
      continue;
    }

    if (isHr(trimmed)) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      html.push('<hr data-ke-style="style1" />');
      index += 1;
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(trimmed);
    if (h3) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      html.push(`<h3 data-ke-size="size23">${renderInlineText(h3[1].trim())}</h3>`);
      index += 1;
      continue;
    }

    const h2 = /^(?:##|#)\s+(.+)$/.exec(trimmed);
    if (h2) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      html.push(`<h2 data-ke-size="size26">${renderInlineText(h2[1].trim())}</h2>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      const blockquoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        blockquoteLines.push(lines[index].trim());
        index += 1;
      }
      html.push(renderBlockquote(blockquoteLines));
      continue;
    }

    if (isTableRow(trimmed) && isTableRow(lines[index + 1] ?? "")) {
      closeParagraph(paragraph, html);
      closeList(list, html);
      const tableLines: string[] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }

    if (isListItem(line)) {
      closeParagraph(paragraph, html);
      list.push(cleanListItem(line));
      index += 1;
      continue;
    }

    closeList(list, html);
    paragraph.push(trimmed);
    index += 1;
  }

  closeParagraph(paragraph, html);
  closeList(list, html);
}

export function markdownToTistoryHtml(markdown: string) {
  const html: string[] = [];

  for (const segment of splitSegments(markdown)) {
    if (segment.type === "code") {
      html.push(renderCode(segment));
      continue;
    }

    renderTextSegment(segment.content, html);
  }

  return sanitizeTistoryHtml(html.join("\n"));
}
