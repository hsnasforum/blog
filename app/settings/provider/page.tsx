import { ProviderSettingsForm } from "@/components/provider-settings-form";
import {
  ensureProviderConfig,
  getConfiguredModelOptions,
  normalizeProviderMode,
} from "@/lib/writer/provider-settings";
import { resolveWriterReasoningEffort } from "@/lib/writer/reasoning-effort";

export const dynamic = "force-dynamic";

export default async function ProviderSettingsPage() {
  const config = await ensureProviderConfig();
  const modelOptions = getConfiguredModelOptions(config.model);
  const reasoningEffort = resolveWriterReasoningEffort(config.model);

  return (
    <div className="space-y-4">
      <header className="hero-card p-5">
        <span className="badge badge-accent">Provider Runtime</span>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Provider / OAuth / Model 설정</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          모델 호출 방식과 사용할 모델을 선택합니다. OAuth는 앱이 토큰을 보관하지 않고, 로컬 proxy 인증
          상태만 서버에서 확인합니다.
        </p>
      </header>

      <ProviderSettingsForm
        initialConfig={{
          mode: normalizeProviderMode(config.mode),
          baseUrl: config.baseUrl,
          model: config.model,
          reasoningEffort: reasoningEffort.effort,
          reasoningEffortWarning: reasoningEffort.warning,
        }}
        initialModelOptions={modelOptions}
      />
    </div>
  );
}
