import { prisma } from "@/lib/prisma";

export const defaultBlogProfileInput = {
  blogName: "내 로컬 블로그",
  targetAudience: "실무형 개발자, 자동화에 관심 있는 1인 창작자",
  defaultTone:
    "명확하고 실무적이되 AI가 쓴 듯한 일반론, 과도하게 정돈된 요약문, 홍보성 표현을 피한다. 실제 사람이 겪는 막힌 지점, 판단 변화, 조건 분기, 예외를 포함한다. 검수 규칙이나 금지 규칙을 독자용 본문에 설명문처럼 쓰지 않는다.",
  preferredStructure:
    "문제 정의 -> 현재 구현/판단 상황 -> 선택 기준 -> 조건 분기 -> 실패 사례 -> 내 환경에서의 판단 -> 추천/비추천 조건 -> 체크리스트. 실제 출처가 제공된 사용자 의견만 필요한 위치에 짧게 반영하고, 출처가 없으면 사용자 의견 섹션이나 부재 고지문을 쓰지 않는다.",
  forbiddenPhrases:
    "무조건, 100% 보장, 클릭만 하면, AI는 중요하다, 자동화는 효율적이다, 대부분의 사용자, 많은 사람들이, 압도적으로, 완벽한 해결책, 출처 부재 고지문, 사용자 의견 부재 고지문, 출처 없는 외부 커뮤니티 소스 나열",
  seoRules: "핵심 키워드 1개를 제목 앞부분에 포함, 소제목(H2/H3) 사용",
  htmlRules: "과도한 인라인 스타일 금지, 의미 태그 우선",
  tooltipRules: "낯선 약어/전문용어에는 첫 등장 시 짧은 설명 추가",
  imagePromptRules: "실제 작업 맥락을 반영한 스크린샷형 이미지 프롬프트 사용",
};

const legacyBlogProfileInput = {
  defaultTone:
    "명확하고 실무적이되 AI가 쓴 듯한 일반론, 과도하게 정돈된 요약문, 홍보성 표현을 피한다. 실제 사람이 겪는 막힌 지점, 판단 변화, 조건 분기, 예외를 포함한다.",
  preferredStructure:
    "문제 정의 -> 내가/현재 구현에서 겪은 문제 -> 실제 사용자 의견이 있는 경우 출처 기반 요약 -> 의견이 갈리는 지점 -> 내 환경에서의 판단 -> 추천/비추천 조건 -> 체크리스트",
  forbiddenPhrases:
    "무조건, 100% 보장, 클릭만 하면, AI는 중요하다, 자동화는 효율적이다, 대부분의 사용자, 많은 사람들이, 압도적으로, 완벽한 해결책",
};

// TODO(userOpinionRules): 다음 schema 변경 때 실제 사용자 의견/출처 활용 규칙을 별도 필드로 분리합니다.

export async function ensureBlogProfile() {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      ...defaultBlogProfileInput,
    },
  });

  const updateData = {
    ...(profile.defaultTone === legacyBlogProfileInput.defaultTone
      ? { defaultTone: defaultBlogProfileInput.defaultTone }
      : {}),
    ...(profile.preferredStructure === legacyBlogProfileInput.preferredStructure
      ? { preferredStructure: defaultBlogProfileInput.preferredStructure }
      : {}),
    ...(profile.forbiddenPhrases === legacyBlogProfileInput.forbiddenPhrases
      ? { forbiddenPhrases: defaultBlogProfileInput.forbiddenPhrases }
      : {}),
  };

  if (Object.keys(updateData).length === 0) {
    return profile;
  }

  return prisma.blogProfile.update({
    where: { id: profile.id },
    data: updateData,
  });
}

export function splitRules(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
