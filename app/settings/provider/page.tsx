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
      <header className="rounded-md border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">Provider / OAuth / Model 설정</h1>
        <p className="mt-1 text-sm text-slate-600">
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
