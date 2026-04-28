import { revalidatePath } from "next/cache";

import { defaultBlogProfileInput, ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BlogProfilePage() {
  const profile = await ensureBlogProfile();

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
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">BlogProfile 설정</h1>
        <p className="mt-1 text-sm text-slate-600">
          작성 톤/구조/금지 표현 규칙을 저장합니다. 모든 생성 요청에서 이 설정이 기본값으로 사용됩니다.
        </p>
      </header>

      <form action={saveBlogProfile} className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="blogName">
            blogName
          </label>
          <input
            id="blogName"
            name="blogName"
            defaultValue={profile.blogName}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="targetAudience">
            targetAudience
          </label>
          <textarea
            id="targetAudience"
            name="targetAudience"
            defaultValue={profile.targetAudience}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="defaultTone">
            defaultTone
          </label>
          <input
            id="defaultTone"
            name="defaultTone"
            defaultValue={profile.defaultTone}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="preferredStructure">
            preferredStructure
          </label>
          <textarea
            id="preferredStructure"
            name="preferredStructure"
            defaultValue={profile.preferredStructure}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="forbiddenPhrases">
            forbiddenPhrases
          </label>
          <textarea
            id="forbiddenPhrases"
            name="forbiddenPhrases"
            defaultValue={profile.forbiddenPhrases}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="seoRules">
            seoRules
          </label>
          <textarea
            id="seoRules"
            name="seoRules"
            defaultValue={profile.seoRules}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="htmlRules">
            htmlRules
          </label>
          <textarea
            id="htmlRules"
            name="htmlRules"
            defaultValue={profile.htmlRules}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="tooltipRules">
            tooltipRules
          </label>
          <textarea
            id="tooltipRules"
            name="tooltipRules"
            defaultValue={profile.tooltipRules}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="imagePromptRules">
            imagePromptRules
          </label>
          <textarea
            id="imagePromptRules"
            name="imagePromptRules"
            defaultValue={profile.imagePromptRules}
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          설정 저장
        </button>
      </form>
    </section>
  );
}
