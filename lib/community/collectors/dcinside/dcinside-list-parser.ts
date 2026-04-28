import { stripHtmlTags } from "@/lib/community/community-utils";
import type {
  DcinsideListItem,
  DcinsideParseResult,
  DcinsideSkipReason,
  DcinsideSkipReasonSummary,
  DcinsideSourceTab,
} from "@/lib/community/collectors/dcinside/dcinside-types";

const defaultDcinsideBaseUrl = "https://gall.dcinside.com";
export const dcinsideParserVersion = "dcinside-list-parser-v1.3.0";
const dangerousBlockPattern = /<(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const eventAttributePattern = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const rowPattern = /<tr\b[\s\S]*?<\/tr>/gi;

function stripDangerousForParse(html: string) {
  return html.replace(dangerousBlockPattern, "").replace(eventAttributePattern, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readAttribute(raw: string, name: string) {
  const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(raw);
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function readClass(raw: string) {
  return readAttribute(raw, "class");
}

function extractCell(row: string, className: string) {
  const pattern = new RegExp(`<td\\b[^>]*class\\s*=\\s*(?:"[^"]*${className}[^"]*"|'[^']*${className}[^']*')[^>]*>([\\s\\S]*?)<\\/td>`, "i");
  return pattern.exec(row)?.[1] ?? "";
}

function extractFirstLink(row: string) {
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(row))) {
    const href = readAttribute(match[1], "href");
    if (!href || (!href.includes("/board/view/") && !href.includes("no="))) continue;
    const rawText = match[2].replace(/<span\b[^>]*class\s*=\s*(?:"[^"]*reply_num[^"]*"|'[^']*reply_num[^']*')[^>]*>[\s\S]*?<\/span>/gi, "");
    return {
      href,
      title: decodeHtml(stripHtmlTags(rawText)),
    };
  }

  return null;
}

function readNumber(value: string) {
  const normalized = decodeHtml(stripHtmlTags(value)).replace(/,/g, "");
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return 0;
}

function readCommentCount(row: string) {
  const replyMatch = /<span\b[^>]*class\s*=\s*(?:"[^"]*reply_num[^"]*"|'[^']*reply_num[^']*')[^>]*>\s*\[?(\d+)\]?\s*<\/span>/i.exec(row);
  if (replyMatch) return Number(replyMatch[1]);
  const bracketMatch = /\[(\d+)\]/.exec(decodeHtml(stripHtmlTags(row)));
  return bracketMatch ? Number(bracketMatch[1]) : 0;
}

function normalizeUrl(rawHref: string, pageUrl?: string | null) {
  try {
    const baseUrl = pageUrl?.trim() || defaultDcinsideBaseUrl;
    const url = new URL(rawHref, baseUrl);
    return url.toString();
  } catch {
    return "";
  }
}

function detectSourceTabFromUrl(url: string | null | undefined): DcinsideSourceTab | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, defaultDcinsideBaseUrl);
    const searchHead = parsed.searchParams.get("search_head");
    if (searchHead === "10") return "info";
    if (searchHead === "110") return "best";
  } catch {
    return null;
  }

  return null;
}

function externalIdFrom(row: string, url: string) {
  const dataNo = readAttribute(row, "data-no");
  if (dataNo) return dataNo;

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("no") ?? "";
  } catch {
    return "";
  }
}

function seoulDateParts(baseDate: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = parts.find((part) => part.type === "year")?.value ?? String(baseDate.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return { year, month, day };
}

function seoulDate(year: string | number, month: string | number, day: string | number, time = "00:00") {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const parsed = new Date(`${yyyy}-${mm}-${dd}T${time}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePublishedAt(rawText: string | null, collectedAt = new Date()): {
  publishedAt: Date | null;
  dateParseMode: "exact" | "same_day_time" | "current_year_month_day" | "short_year_month_day" | "unparsed";
} {
  if (!rawText) return { publishedAt: null, dateParseMode: "unparsed" };
  const text = rawText.trim();
  if (!text) return { publishedAt: null, dateParseMode: "unparsed" };

  const normalized = text.replace(/[.]/g, "-").replace(/\s+/g, " ");
  const timeOnly = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (timeOnly) {
    const { year, month, day } = seoulDateParts(collectedAt);
    const publishedAt = seoulDate(year, month, day, `${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}`);
    return { publishedAt, dateParseMode: publishedAt ? "same_day_time" : "unparsed" };
  }

  const shortYearMonthDay = /^(\d{2})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (shortYearMonthDay) {
    const year = 2000 + Number(shortYearMonthDay[1]);
    const publishedAt = seoulDate(year, shortYearMonthDay[2], shortYearMonthDay[3]);
    return { publishedAt, dateParseMode: publishedAt ? "short_year_month_day" : "unparsed" };
  }

  const monthDay = /^(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (monthDay) {
    const { year } = seoulDateParts(collectedAt);
    const publishedAt = seoulDate(year, monthDay[1], monthDay[2]);
    return { publishedAt, dateParseMode: publishedAt ? "current_year_month_day" : "unparsed" };
  }

  const exactDate = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(normalized);
  if (exactDate) {
    const time = exactDate[4] ? `${exactDate[4].padStart(2, "0")}:${exactDate[5]}` : "00:00";
    const publishedAt = seoulDate(exactDate[1], exactDate[2], exactDate[3], time);
    return { publishedAt, dateParseMode: publishedAt ? "exact" : "unparsed" };
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? { publishedAt: null, dateParseMode: "unparsed" }
    : { publishedAt: parsed, dateParseMode: "exact" };
}

function readDateText(row: string) {
  const dateCell = extractCell(row, "gall_date");
  const titleMatch = /title\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(dateCell);
  return decodeHtml(titleMatch?.[1] ?? titleMatch?.[2] ?? stripHtmlTags(dateCell)) || null;
}

function readCategory(row: string, title: string) {
  const titleCell = extractCell(row, "gall_tit");
  const categoryTagPattern = /<(?:em|span|b)\b([^>]*)>([\s\S]*?)<\/(?:em|span|b)>/gi;
  let match: RegExpExecArray | null;

  while ((match = categoryTagPattern.exec(titleCell))) {
    const className = readClass(match[1]);
    const category = decodeHtml(stripHtmlTags(match[2]));
    const categoryLikeClass =
      /(?:^|\s)(?:category|gall_head|mal_head|title_head|write_head|subject_head|headtxt)(?:\s|$)/i.test(className);

    if (!categoryLikeClass) continue;
    if (!category || /\[\d+\]/.test(category)) continue;
    if (/reply|comment|icon|img|pic|sp_/i.test(className)) continue;
    if (category === title || category.length > 20) continue;
    if (title.includes(category) && category.length > 12) continue;

    return category;
  }

  const bracketPrefix = /^\s*\[([^\]]{1,12})\]/.exec(title);
  return bracketPrefix ? bracketPrefix[1] : null;
}

function readHasImage(row: string) {
  const titleCell = extractCell(row, "gall_tit");
  if (!titleCell) return false;
  const titleAttachmentPattern =
    /<(?:img|span|em|i)\b[^>]*(?:class\s*=\s*(?:"[^"]*(?:icon_pic|icon_picture|ico_pic|attached_image)[^"]*"|'[^']*(?:icon_pic|icon_picture|ico_pic|attached_image)[^']*')[^>]*(?:alt|title)\s*=\s*(?:"[^"]*(?:첨부|이미지|사진|image|photo|picture)[^"]*"|'[^']*(?:첨부|이미지|사진|image|photo|picture)[^']*')|(?:alt|title)\s*=\s*(?:"[^"]*(?:첨부|이미지|사진|image|photo|picture)[^"]*"|'[^']*(?:첨부|이미지|사진|image|photo|picture)[^']*')[^>]*class\s*=\s*(?:"[^"]*(?:icon_pic|icon_picture|ico_pic|attached_image)[^"]*"|'[^']*(?:icon_pic|icon_picture|ico_pic|attached_image)[^']*'))[^>]*>/i;
  return titleAttachmentPattern.test(titleCell);
}

function readAuthorMasked(row: string) {
  const writerCell = extractCell(row, "gall_writer");
  const dataNick = readAttribute(writerCell, "data-nick");
  const raw = dataNick || stripHtmlTags(writerCell);
  const decoded = decodeHtml(raw);
  if (!decoded) return null;
  if (decoded.length <= 2) return "*".repeat(decoded.length);
  return `${decoded.slice(0, 1)}***${decoded.slice(-1)}`;
}

function isNoiseRow(row: string, title: string) {
  const rowClass = readClass(row);
  const text = decodeHtml(stripHtmlTags(row));
  return (
    /notice|ad|banner|ub-notice|gall_notice/i.test(rowClass) ||
    /^공지$|^설문$|^AD$/i.test(title) ||
    /운영자|디시콘|만두몰|공지사항/.test(text)
  );
}

function createSkipReasons(): DcinsideSkipReasonSummary {
  return {
    empty_row: 0,
    notice_or_ad: 0,
    missing_title: 0,
    missing_url: 0,
    missing_external_id: 0,
    duplicate: 0,
  };
}

function incrementSkipReason(skipReasons: DcinsideSkipReasonSummary, reason: DcinsideSkipReason) {
  skipReasons[reason] += 1;
}

function missingLinkReason(row: string): DcinsideSkipReason {
  const text = decodeHtml(stripHtmlTags(row));
  if (!text) return "empty_row";
  if (isNoiseRow(row, text)) return "notice_or_ad";
  if (/<a\b/i.test(row)) return "missing_url";
  return "missing_title";
}

export function parseDcinsideListHtml(params: {
  html: string;
  sourceTab: DcinsideSourceTab;
  pageUrl?: string | null;
  collectedAt?: Date;
}): DcinsideParseResult {
  const html = stripDangerousForParse(params.html);
  const rows = html.match(rowPattern) ?? [];
  const items: DcinsideListItem[] = [];
  const skipReasons = createSkipReasons();
  const detectedTabs = new Set<DcinsideSourceTab>();
  const pageDetectedSourceTab = detectSourceTabFromUrl(params.pageUrl);
  if (pageDetectedSourceTab) detectedTabs.add(pageDetectedSourceTab);

  for (const row of rows) {
    const link = extractFirstLink(row);
    if (!link?.href || !link.title) {
      incrementSkipReason(skipReasons, link?.href && !link.title ? "missing_title" : missingLinkReason(row));
      continue;
    }

    if (isNoiseRow(row, link.title)) {
      incrementSkipReason(skipReasons, "notice_or_ad");
      continue;
    }

    const url = normalizeUrl(link.href, params.pageUrl);
    const externalId = externalIdFrom(row, url);
    const detectedSourceTab = detectSourceTabFromUrl(url) ?? pageDetectedSourceTab;
    if (detectedSourceTab) detectedTabs.add(detectedSourceTab);
    if (!url) {
      incrementSkipReason(skipReasons, "missing_url");
      continue;
    }

    if (!externalId) {
      incrementSkipReason(skipReasons, "missing_external_id");
      continue;
    }

    const createdAtText = readDateText(row);
    const parsedDate = parsePublishedAt(createdAtText, params.collectedAt);

    items.push({
      externalId,
      title: link.title,
      url,
      canonicalUrl: url,
      detectedSourceTab,
      category: readCategory(row, link.title),
      authorMasked: readAuthorMasked(row),
      createdAtText,
      publishedAt: parsedDate.publishedAt,
      dateParseMode: parsedDate.dateParseMode,
      viewCount: readNumber(extractCell(row, "gall_count")),
      commentCount: readCommentCount(row),
      recommendCount: readNumber(extractCell(row, "gall_recommend")),
      hasImage: readHasImage(row),
      sourceTab: params.sourceTab,
    });
  }

  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = `${item.sourceTab}:${item.externalId || item.canonicalUrl}`;
    if (seen.has(key)) {
      incrementSkipReason(skipReasons, "duplicate");
      return false;
    }
    seen.add(key);
    return true;
  });

  const skippedCount = Object.values(skipReasons).reduce((sum, count) => sum + count, 0);
  const detectedSourceTab = detectedTabs.size === 1 ? Array.from(detectedTabs)[0] : null;
  const sourceTabMismatch = Boolean(detectedSourceTab && detectedSourceTab !== params.sourceTab);
  const warnings = [
    ...(sourceTabMismatch
      ? [`선택한 sourceTab(${params.sourceTab})과 URL에서 추론한 sourceTab(${detectedSourceTab})이 다릅니다.`]
      : []),
  ];

  return {
    items: uniqueItems,
    skippedCount,
    skipReasons,
    parserVersion: dcinsideParserVersion,
    detectedSourceTab,
    sourceTabMismatch,
    warnings,
  };
}
