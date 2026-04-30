import { revalidatePath } from "next/cache";

import { BlogProfileForm } from "@/components/blog-profile-form";
import { defaultBlogProfileInput, ensureBlogProfile } from "@/lib/blog-profile";
import { refuseHubBlogProfilePreset, type BlogProfileInput } from "@/lib/blog-profile-presets";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BlogProfilePage() {
  const profile = await ensureBlogProfile();
  const profileInput: BlogProfileInput = {
    blogName: profile.blogName,
    targetAudience: profile.targetAudience,
    defaultTone: profile.defaultTone,
    preferredStructure: profile.preferredStructure,
    forbiddenPhrases: profile.forbiddenPhrases,
    seoRules: profile.seoRules,
    htmlRules: profile.htmlRules,
    tooltipRules: profile.tooltipRules,
    imagePromptRules: profile.imagePromptRules,
  };

  async function saveBlogProfile(formData: FormData) {
    "use server";

    await prisma.blogProfile.upsert({
      where: { id: "default" },
      update: {
        blogName: String(formData.get("blogName") ?? defaultBlogProfileInput.blogName),
        targetAudience: String(formData.get("targetAudience") ?? defaultBlogProfileInput.targetAudience),
        defaultTone: String(formData.get("defaultTone") ?? defaultBlogProfileInput.defaultTone),
        preferredStructure: String(
          formData.get("preferredStructure") ?? defaultBlogProfileInput.preferredStructure,
        ),
        forbiddenPhrases: String(
          formData.get("forbiddenPhrases") ?? defaultBlogProfileInput.forbiddenPhrases,
        ),
        seoRules: String(formData.get("seoRules") ?? defaultBlogProfileInput.seoRules),
        htmlRules: String(formData.get("htmlRules") ?? defaultBlogProfileInput.htmlRules),
        tooltipRules: String(formData.get("tooltipRules") ?? defaultBlogProfileInput.tooltipRules),
        imagePromptRules: String(
          formData.get("imagePromptRules") ?? defaultBlogProfileInput.imagePromptRules,
        ),
      },
      create: {
        id: "default",
        blogName: String(formData.get("blogName") ?? defaultBlogProfileInput.blogName),
        targetAudience: String(formData.get("targetAudience") ?? defaultBlogProfileInput.targetAudience),
        defaultTone: String(formData.get("defaultTone") ?? defaultBlogProfileInput.defaultTone),
        preferredStructure: String(
          formData.get("preferredStructure") ?? defaultBlogProfileInput.preferredStructure,
        ),
        forbiddenPhrases: String(
          formData.get("forbiddenPhrases") ?? defaultBlogProfileInput.forbiddenPhrases,
        ),
        seoRules: String(formData.get("seoRules") ?? defaultBlogProfileInput.seoRules),
        htmlRules: String(formData.get("htmlRules") ?? defaultBlogProfileInput.htmlRules),
        tooltipRules: String(formData.get("tooltipRules") ?? defaultBlogProfileInput.tooltipRules),
        imagePromptRules: String(
          formData.get("imagePromptRules") ?? defaultBlogProfileInput.imagePromptRules,
        ),
      },
    });

    revalidatePath("/");
    revalidatePath("/settings/blog-profile");
  }

  return (
    <section className="space-y-4">
      <header className="hero-card p-5">
        <span className="badge badge-accent">Writing Profile</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">BlogProfile 설정</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          작성 톤/구조/금지 표현 규칙을 저장합니다. 모든 생성 요청에서 이 설정이 기본값으로 사용됩니다.
        </p>
      </header>

      <BlogProfileForm
        profile={profileInput}
        preset={refuseHubBlogProfilePreset}
        action={saveBlogProfile}
      />
    </section>
  );
}
