import { prisma } from "@/lib/prisma";
import { defaultBlogProfileInput } from "@/lib/blog-profile-presets";

export { defaultBlogProfileInput } from "@/lib/blog-profile-presets";

// TODO(userOpinionRules): 다음 schema 변경 때 실제 사용자 의견/출처 활용 규칙을 별도 필드로 분리합니다.

export async function ensureBlogProfile() {
  return prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ...defaultBlogProfileInput,
    },
  });
}

export function splitRules(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
