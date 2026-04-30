"use client";

import { useState } from "react";

import type { BlogProfileInput } from "@/lib/blog-profile-presets";

type BlogProfileFormProps = {
  profile: BlogProfileInput;
  preset: BlogProfileInput;
  action: (formData: FormData) => void | Promise<void>;
};

const blogProfileFields: Array<{
  name: keyof BlogProfileInput;
  label: string;
  multiline: boolean;
  minHeightClassName?: string;
}> = [
  { name: "blogName", label: "blogName", multiline: false },
  { name: "targetAudience", label: "targetAudience", multiline: true, minHeightClassName: "min-h-36" },
  { name: "defaultTone", label: "defaultTone", multiline: true, minHeightClassName: "min-h-36" },
  { name: "preferredStructure", label: "preferredStructure", multiline: true, minHeightClassName: "min-h-56" },
  { name: "forbiddenPhrases", label: "forbiddenPhrases", multiline: true, minHeightClassName: "min-h-56" },
  { name: "seoRules", label: "seoRules", multiline: true, minHeightClassName: "min-h-44" },
  { name: "htmlRules", label: "htmlRules", multiline: true, minHeightClassName: "min-h-44" },
  { name: "tooltipRules", label: "tooltipRules", multiline: true, minHeightClassName: "min-h-32" },
  { name: "imagePromptRules", label: "imagePromptRules", multiline: true, minHeightClassName: "min-h-44" },
];

export function BlogProfileForm({ profile, preset, action }: BlogProfileFormProps) {
  const [values, setValues] = useState<BlogProfileInput>(profile);
  const [presetApplied, setPresetApplied] = useState(false);

  const updateField = (name: keyof BlogProfileInput, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setPresetApplied(false);
  };

  return (
    <form action={action} className="glass-card space-y-4 p-5">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">REFUSE HUB 프리셋</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              버튼을 누르면 화면 입력값만 채웁니다. DB에는 설정 저장을 눌러야 반영됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValues(preset);
              setPresetApplied(true);
            }}
            className="btn"
          >
            REFUSE HUB 프리셋 적용
          </button>
        </div>
        {presetApplied ? (
          <p className="mt-2 text-xs text-emerald-700">프리셋을 입력값에 채웠습니다. 저장 전까지 DB는 변경되지 않습니다.</p>
        ) : null}
      </div>

      {blogProfileFields.map((field) => (
        <div key={field.name} className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor={field.name}>
            {field.label}
          </label>
          {field.multiline ? (
            <textarea
              id={field.name}
              name={field.name}
              value={values[field.name]}
              onChange={(event) => updateField(field.name, event.target.value)}
              className={`${field.minHeightClassName ?? "min-h-20"} field`}
            />
          ) : (
            <input
              id={field.name}
              name={field.name}
              value={values[field.name]}
              onChange={(event) => updateField(field.name, event.target.value)}
              className="field"
            />
          )}
        </div>
      ))}

      <button
        type="submit"
        className="btn btn-primary"
      >
        설정 저장
      </button>
    </form>
  );
}
