// ============ Settings screens ============

function SettingsScreen({ state, dispatch, subPage }) {
  const [tab, setTab] = useState(subPage || "blog-profile");

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880, marginInline: "auto", width: "100%" }}>
      <div>
        <Badge tone="accent" dot>설정</Badge>
        <h1 style={{ margin: "10px 0 6px", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>워크스페이스</h1>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-3)" }}>블로그 프로필과 AI Provider 설정을 관리합니다.</p>
      </div>

      <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, width: "fit-content" }}>
        <SettingsTab active={tab === "blog-profile"} onClick={() => setTab("blog-profile")} icon={<IconUser size={14} />}>BlogProfile</SettingsTab>
        <SettingsTab active={tab === "provider"} onClick={() => setTab("provider")} icon={<IconCloud size={14} />}>Provider</SettingsTab>
      </div>

      {tab === "blog-profile" ? <BlogProfileForm state={state} dispatch={dispatch} /> : <ProviderForm state={state} dispatch={dispatch} />}
    </div>
  );
}

function SettingsTab({ active, onClick, children, icon }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "7px 14px", borderRadius: 8,
      fontSize: 13, fontWeight: 600,
      background: active ? "var(--surface-strong)" : "transparent",
      color: active ? "var(--text-1)" : "var(--text-3)",
      border: `1px solid ${active ? "var(--border-strong)" : "transparent"}`,
      cursor: "pointer",
    }}>{icon} {children}</button>
  );
}

function BlogProfileForm({ state, dispatch }) {
  const [profile, setProfile] = useState(state.profile);
  const [saved, setSaved] = useState(false);

  function save() {
    dispatch.updateProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function toggleTone(tag) {
    const has = profile.toneTags.includes(tag);
    setProfile({ ...profile, toneTags: has ? profile.toneTags.filter(t => t !== tag) : [...profile.toneTags, tag] });
  }

  const allTones = ["분석적", "친근함", "실용 중심", "스토리텔링", "전문가 톤", "유머"];

  return (
    <Card padding={24}>
      <Field label="블로그 이름">
        <Input value={profile.blogName} onChange={(e) => setProfile({ ...profile, blogName: e.target.value })} />
      </Field>
      <Field label="운영자 이름">
        <Input value={profile.ownerName} onChange={(e) => setProfile({ ...profile, ownerName: e.target.value })} />
      </Field>
      <Field label="니치 / 분야" hint="검색 결과 차별화에 사용">
        <Input value={profile.niche} onChange={(e) => setProfile({ ...profile, niche: e.target.value })} />
      </Field>
      <Field label="타겟 독자">
        <Input value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} />
      </Field>
      <Field label="톤 태그" hint="여러 개 선택 가능">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {allTones.map(t => {
            const active = profile.toneTags.includes(t);
            return (
              <button key={t} onClick={() => toggleTone(t)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: active ? "color-mix(in oklch, var(--accent) 20%, transparent)" : "var(--bg-1)",
                color: active ? "var(--accent)" : "var(--text-3)",
                border: `1px solid ${active ? "color-mix(in oklch, var(--accent) 45%, transparent)" : "var(--border)"}`,
                cursor: "pointer",
              }}>{t}</button>
            );
          })}
        </div>
      </Field>
      <Field label="제외 토픽" hint="자동 추천에서 제외할 주제, 쉼표로 구분">
        <Input value={profile.excludeTopics.join(", ")} onChange={(e) => setProfile({ ...profile, excludeTopics: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
      </Field>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost" onClick={() => setProfile(state.profile)}>되돌리기</Button>
        <Button variant="primary" icon={saved ? <IconCheck size={14} /> : null} onClick={save}>{saved ? "저장됨" : "저장"}</Button>
      </div>
    </Card>
  );
}

function ProviderForm({ state, dispatch }) {
  const [provider, setProvider] = useState(state.provider);
  const providers = ["Anthropic", "OpenAI", "Google", "Local (Ollama)"];
  const models = {
    "Anthropic": ["claude-sonnet-4-5", "claude-opus-4", "claude-haiku-4-5"],
    "OpenAI": ["gpt-5", "gpt-4o", "gpt-4o-mini"],
    "Google": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "Local (Ollama)": ["llama-3.3-70b", "qwen-2.5-coder"],
  };

  return (
    <Card padding={24}>
      <Field label="Provider">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {providers.map(p => (
            <button key={p} onClick={() => setProvider({ ...provider, provider: p, model: models[p][0] })} style={{
              padding: "12px 14px", borderRadius: 12, textAlign: "left",
              background: provider.provider === p ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "var(--bg-1)",
              border: `1px solid ${provider.provider === p ? "color-mix(in oklch, var(--accent) 45%, transparent)" : "var(--border)"}`,
              color: provider.provider === p ? "var(--text-1)" : "var(--text-2)",
              cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p}</span>
              {provider.provider === p && <IconCheck size={14} />}
            </button>
          ))}
        </div>
      </Field>

      <Field label="모델">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {models[provider.provider].map(m => (
            <button key={m} onClick={() => setProvider({ ...provider, model: m })} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12,
              background: provider.model === m ? "var(--surface-strong)" : "var(--bg-1)",
              color: provider.model === m ? "var(--text-1)" : "var(--text-3)",
              border: `1px solid ${provider.model === m ? "var(--border-strong)" : "var(--border)"}`,
              cursor: "pointer", fontFamily: "var(--font-mono)",
            }}>{m}</button>
          ))}
        </div>
      </Field>

      <Field label="모드">
        <div style={{ display: "flex", gap: 6 }}>
          {["fast", "balanced", "quality"].map(m => (
            <button key={m} onClick={() => setProvider({ ...provider, mode: m })} style={{
              flex: 1, padding: "10px 12px", borderRadius: 10, fontSize: 12.5,
              background: provider.mode === m ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "var(--bg-1)",
              color: provider.mode === m ? "var(--accent)" : "var(--text-3)",
              border: `1px solid ${provider.mode === m ? "color-mix(in oklch, var(--accent) 45%, transparent)" : "var(--border)"}`,
              cursor: "pointer", fontWeight: 600,
            }}>{m}</button>
          ))}
        </div>
      </Field>

      <Field label="API Key" hint="로컬에만 저장됩니다">
        <Input type="password" placeholder="sk-ant-..." />
      </Field>

      <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: "var(--bg-1)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 10 }}>이번 달 사용량</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-4)" }}>비용</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>${provider.monthlyCost.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-4)" }}>토큰</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{(provider.monthlyTokens/1000).toFixed(0)}K</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="ghost">테스트 호출</Button>
        <Button variant="primary" onClick={() => dispatch.updateProvider(provider)}>저장</Button>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginBottom: hint ? 2 : 8 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 8 }}>{hint}</div>}
      {children}
    </div>
  );
}

window.SettingsScreen = SettingsScreen;
