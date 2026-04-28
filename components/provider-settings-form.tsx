"use client";

import { useState } from "react";

type ProviderMode = "api-key" | "oauth-proxy";

type ProviderConfigView = {
  mode: ProviderMode;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  reasoningEffortWarning: string | null;
};

type AuthCheckResult = {
  ok: boolean;
  status: "authenticated" | "unauthenticated" | "unreachable";
  models: string[];
  message: string;
};

export function ProviderSettingsForm({
  initialConfig,
  initialModelOptions,
}: {
  initialConfig: ProviderConfigView;
  initialModelOptions: string[];
}) {
  const [mode, setMode] = useState<ProviderMode>(initialConfig.mode);
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl);
  const [model, setModel] = useState(initialConfig.model);
  const [modelOptions, setModelOptions] = useState(initialModelOptions);
  const [customModel, setCustomModel] = useState("");
  const [pending, setPending] = useState<"save" | "check" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyModelOptions(models: string[]) {
    const unique = new Set([...modelOptions, ...models, model].filter(Boolean));
    setModelOptions(Array.from(unique));
  }

  async function saveConfig() {
    const selectedModel = customModel.trim() || model.trim();
    setPending("save");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/provider-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          baseUrl,
          model: selectedModel,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "provider 설정 저장 실패");
      }

      setModel(payload.config.model);
      setCustomModel("");
      applyModelOptions([payload.config.model]);
      setMessage("provider 설정을 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "provider 설정 저장 실패");
    } finally {
      setPending(null);
    }
  }

  async function checkAuth() {
    setPending("check");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/provider-auth/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          baseUrl,
        }),
      });
      const payload = (await response.json()) as AuthCheckResult;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "provider 인증 확인 실패");
      }

      applyModelOptions(payload.models);
      setMessage(`${payload.message} 모델 ${payload.models.length}개를 확인했습니다.`);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "provider 인증 확인 실패");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="provider-mode">
            provider mode
          </label>
          <select
            id="provider-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as ProviderMode)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="oauth-proxy">oauth-proxy</option>
            <option value="api-key">api-key</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-800" htmlFor="provider-model">
            model
          </label>
          <select
            id="provider-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {modelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="provider-base-url">
          OpenAI-compatible base URL
        </label>
        <input
          id="provider-base-url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-800" htmlFor="custom-model">
          custom model
        </label>
        <input
          id="custom-model"
          value={customModel}
          onChange={(event) => setCustomModel(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="목록에 없는 모델명을 직접 입력"
        />
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <p>
          reasoning effort:{" "}
          <span className="font-medium text-slate-900">{initialConfig.reasoningEffort}</span>
        </p>
        <p className="mt-1 text-xs text-slate-600">
          환경변수 `WRITER_REASONING_EFFORT`로 설정합니다. 현재 OpenAI-compatible provider 요청에는
          reasoning 모델에서만 reasoning effort가 포함됩니다.
        </p>
        {initialConfig.reasoningEffortWarning ? (
          <p className="mt-1 text-xs text-amber-700">{initialConfig.reasoningEffortWarning}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={checkAuth}
          disabled={pending !== null}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          {pending === "check" ? "확인 중..." : "인증 확인 / 모델 불러오기"}
        </button>
        <button
          type="button"
          onClick={saveConfig}
          disabled={pending !== null}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {pending === "save" ? "저장 중..." : "설정 저장"}
        </button>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        OAuth 토큰과 실제 비밀값은 이 화면에 입력하거나 저장하지 않습니다. `oauth-proxy` 모드에서는
        서버가 proxy의 OpenAI-compatible endpoint만 호출합니다.
      </div>
    </section>
  );
}
