import type { ParsedSeoPackage } from "@/lib/export/export-types";

type RawSeoPackage = {
  metaTitle?: unknown;
  seoTitle?: unknown;
  title?: unknown;
  metaDescription?: unknown;
  description?: unknown;
  tags?: unknown;
};

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseSeoPackage(raw: string | null | undefined, fallbackTitle: string): ParsedSeoPackage {
  if (!raw?.trim()) {
    return {
      seoTitle: fallbackTitle,
      metaDescription: "",
      tags: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as RawSeoPackage;

    return {
      seoTitle: String(parsed.metaTitle ?? parsed.seoTitle ?? parsed.title ?? fallbackTitle).trim(),
      metaDescription: String(parsed.metaDescription ?? parsed.description ?? "").trim(),
      tags: normalizeTags(parsed.tags),
    };
  } catch {
    return {
      seoTitle: fallbackTitle,
      metaDescription: "",
      tags: [],
    };
  }
}
