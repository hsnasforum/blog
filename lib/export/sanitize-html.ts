const dangerousBlockPattern = /<(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const dangerousTagPattern = /<\/?(script|iframe|object|embed)\b[^>]*>/gi;
const eventAttributePattern = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const styleAttributePattern = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const javascriptUrlPattern = /javascript\s*:/gi;
const allowedTistoryTags = new Set([
  "p",
  "h2",
  "h3",
  "hr",
  "blockquote",
  "b",
  "br",
  "table",
  "caption",
  "tr",
  "th",
  "td",
  "ul",
  "li",
  "pre",
  "code",
  "span",
]);
const selfClosingTags = new Set(["hr", "br"]);
const allowedStyleProperties = new Set([
  "width",
  "border-collapse",
  "border",
  "margin",
  "padding",
  "background",
  "background-color",
  "text-align",
  "vertical-align",
  "caption-side",
  "font-weight",
  "padding-bottom",
  "list-style-type",
  "overflow",
]);

export function stripDangerousHtml(value: string) {
  return value
    .replace(dangerousBlockPattern, "")
    .replace(dangerousTagPattern, "")
    .replace(eventAttributePattern, "")
    .replace(styleAttributePattern, "")
    .replace(javascriptUrlPattern, "");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeExportHtml(html: string) {
  return stripDangerousHtml(html);
}

function readAttributeValue(rawValue: string | undefined) {
  if (!rawValue) return "";
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseAttributes(rawAttributes: string) {
  const attributes = new Map<string, string>();
  const pattern = /([a-zA-Z0-9_-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(rawAttributes))) {
    attributes.set(match[1].toLowerCase(), readAttributeValue(match[2]));
  }

  return attributes;
}

function sanitizeStyle(value: string) {
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator === -1) return null;

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim();

      if (!allowedStyleProperties.has(property)) return null;
      if (/javascript\s*:|expression\s*\(|url\s*\(/i.test(propertyValue)) return null;

      return `${property}: ${propertyValue}`;
    })
    .filter(Boolean)
    .join("; ");
}

function normalizeClass(value: string) {
  const normalized = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^[a-zA-Z0-9_-]{1,48}$/.test(item))
    .join(" ");

  return normalized.slice(0, 120);
}

function keepAttribute(tagName: string, name: string, value: string) {
  if (name === "data-ke-size" && ["p", "h2", "h3"].includes(tagName)) {
    return ["size16", "size23", "size26"].includes(value) ? `${name}="${escapeHtml(value)}"` : null;
  }

  if (name === "data-ke-style" && ["hr", "blockquote"].includes(tagName)) {
    return value === "style1" ? `${name}="${escapeHtml(value)}"` : null;
  }

  if (name === "data-ke-align" && tagName === "table") {
    return value === "alignLeft" ? `${name}="${escapeHtml(value)}"` : null;
  }

  if (name === "data-ke-list-type" && tagName === "ul") {
    return value === "disc" ? `${name}="${escapeHtml(value)}"` : null;
  }

  if (name === "data-ui" && tagName === "span") {
    return value === "term" ? `${name}="${escapeHtml(value)}"` : null;
  }

  if (name === "data-note" && tagName === "span") {
    return `${name}="${escapeHtml(value)}"`;
  }

  if (name === "class" && ["pre", "code"].includes(tagName)) {
    const className = normalizeClass(value);
    return className ? `${name}="${escapeHtml(className)}"` : null;
  }

  if (name === "style") {
    const style = sanitizeStyle(value);
    return style ? `${name}="${escapeHtml(style)}"` : null;
  }

  return null;
}

function sanitizeTag(rawTag: string) {
  const tagMatch = /^<\s*(\/)?\s*([a-zA-Z0-9]+)\b([^>]*)\/?\s*>$/.exec(rawTag);
  if (!tagMatch) return "";

  const isClosing = Boolean(tagMatch[1]);
  const tagName = tagMatch[2].toLowerCase();
  const rawAttributes = tagMatch[3] ?? "";
  const isSelfClosing = rawTag.endsWith("/>") || selfClosingTags.has(tagName);

  if (!allowedTistoryTags.has(tagName)) return "";
  if (isClosing) return selfClosingTags.has(tagName) ? "" : `</${tagName}>`;

  const attributes = parseAttributes(rawAttributes);
  const keptAttributes = Array.from(attributes.entries())
    .map(([name, value]) => keepAttribute(tagName, name, value))
    .filter(Boolean);
  const attributeText = keptAttributes.length > 0 ? ` ${keptAttributes.join(" ")}` : "";

  return isSelfClosing ? `<${tagName}${attributeText} />` : `<${tagName}${attributeText}>`;
}

export function sanitizeTistoryHtml(html: string) {
  const cleaned = html
    .replace(dangerousBlockPattern, "")
    .replace(dangerousTagPattern, "")
    .replace(eventAttributePattern, "")
    .replace(javascriptUrlPattern, "");
  return cleaned.replace(/<\/?[^>]+>/g, (tag) => sanitizeTag(tag));
}
