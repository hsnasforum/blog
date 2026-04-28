import type { NaverCredentials } from "@/lib/trend/naver-config";

export function getNaverHeaders(credentials: NaverCredentials) {
  return {
    "X-Naver-Client-Id": credentials.clientId,
    "X-Naver-Client-Secret": credentials.clientSecret,
  };
}

export function stripHtmlTags(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").slice(0, 500);
  }

  return "unknown_error";
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
