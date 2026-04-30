// ============ App shell — sidebar + context bar + router ============

const NAV = [
  { id: "dashboard", label: "대시보드", icon: <IconHome /> },
  { id: "topic-new", label: "새 토픽", icon: <IconPlus /> },
  { id: "trends", label: "Trend Scout", icon: <IconRadar /> },
  { id: "workflow", label: "워크플로우", icon: <IconWorkflow /> },
  { id: "settings", label: "설정", icon: <IconSettings /> },
];

function App() {
  const [route, setRoute] = useState({ screen: "dashboard", params: {} });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const [posts, setPosts] = useState(SEED_POSTS);
  const [topics, setTopics] = useState(SEED_TOPICS);
  const [candidates, setCandidates] = useState(SEED_CANDIDATES);
  const [profile, setProfile] = useState(MOCK_PROFILE);
  const [provider, setProvider] = useState(MOCK_PROVIDER);

  const state = {
    posts, topics, candidates, profile, provider,
    logs: SEED_LOGS,
    activeTopicId: route.params.topicId,
    activePostId: route.params.postId,
  };

  const dispatch = {
    updatePost: (id, patch) => setPosts(prev => prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    updateProfile: (p) => setProfile(p),
    updateProvider: (p) => setProvider(p),
    createTopic: ({ rawTopic, memo }) => {
      const id = "t-" + Math.floor(Math.random() * 9000 + 1000);
      const t = { id, rawTopic, memo, status: "scoring", createdAt: new Date().toISOString(), candidatesCount: 0, postsCount: 0 };
      setTopics(prev => [t, ...prev]);
      // Seed some candidates for the new topic so Trends screen has content
      const seeded = SEED_CANDIDATES.slice(0, 4).map((c, i) => ({ ...c, id: `${id}-c${i}`, topicId: id, keyword: `${rawTopic} — 후보 ${i+1}` }));
      setCandidates(prev => [...seeded, ...prev]);
      return t;
    },
    createPostFromCandidate: (candidate) => {
      const id = "p-" + Math.floor(Math.random() * 9000 + 1000);
      const newPost = {
        id, topicId: candidate.topicId, candidateId: candidate.id,
        title: candidate.titles[0] || candidate.keyword,
        angle: candidate.angle,
        workflowStep: "outline",
        updatedAt: new Date().toISOString(),
        outline: null, draft: null, reviewReport: null, seoPackage: null,
      };
      setPosts(prev => [newPost, ...prev]);
      return newPost;
    },
  };

  const navigate = (screen, params = {}) => {
    setRoute({ screen, params });
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(o => !o); }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tweaks defaults
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "aurora",
    "ambient": true,
    "density": "comfortable"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.body.dataset.theme = tweaks.theme || "aurora";
    document.querySelector(".ambient").style.display = tweaks.ambient ? "" : "none";
  }, [tweaks.theme, tweaks.ambient]);

  const screen = (() => {
    switch (route.screen) {
      case "dashboard": return <DashboardScreen state={state} navigate={navigate} dispatch={dispatch} />;
      case "topic-new": return <TopicNewScreen navigate={navigate} dispatch={dispatch} />;
      case "trends": return <TrendsScreen state={state} navigate={navigate} dispatch={dispatch} />;
      case "workflow": return <WorkflowScreen state={state} navigate={navigate} dispatch={dispatch} />;
      case "settings": return <SettingsScreen state={state} dispatch={dispatch} />;
      default: return <DashboardScreen state={state} navigate={navigate} dispatch={dispatch} />;
    }
  })();

  const contextBarTitle = (() => {
    switch (route.screen) {
      case "dashboard": return "대시보드";
      case "topic-new": return "새 토픽";
      case "trends": return "Trend Scout";
      case "workflow": return "Post Workflow";
      case "settings": return "설정";
    }
  })();

  return (
    <>
      <StyleInjector />

      {/* Sidebar */}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 232, zIndex: 50,
        padding: 16, display: "flex", flexDirection: "column", gap: 4,
        borderRight: "1px solid var(--border)",
        background: "color-mix(in oklch, var(--bg-0) 75%, transparent)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        transform: sidebarOpen ? "translateX(0)" : "",
        transition: "transform .25s ease",
      }} className="app-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 16px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          <IconLogo size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>Local Writer</div>
            <div style={{ fontSize: 10.5, color: "var(--text-4)", whiteSpace: "nowrap" }}>v0.4 · MVP</div>
          </div>
        </div>

        {NAV.map(item => {
          const active = route.screen === item.id || (item.id === "trends" && route.screen === "trends") || (item.id === "workflow" && route.screen === "workflow");
          return (
            <button key={item.id} onClick={() => navigate(item.id, item.id === "trends" ? { topicId: topics[0]?.id } : item.id === "workflow" ? { postId: posts[0]?.id } : {})} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 10,
              fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
              background: active ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-2)",
              border: `1px solid ${active ? "color-mix(in oklch, var(--accent) 35%, transparent)" : "transparent"}`,
              cursor: "pointer", textAlign: "left",
              transition: "background .15s, color .15s",
            }}
              onMouseEnter={(e) => !active && (e.currentTarget.style.background = "var(--surface)")}
              onMouseLeave={(e) => !active && (e.currentTarget.style.background = "transparent")}>
              {item.icon}
              {item.label}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--bg-0)", fontSize: 12, fontWeight: 700 }}>
              {profile.ownerName.slice(0,1)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{profile.ownerName}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{profile.blogName}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }} className="sb-backdrop" />}

      {/* Context bar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        marginLeft: 232,
        height: 60, padding: "0 24px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in oklch, var(--bg-0) 70%, transparent)",
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
      }} className="app-context">
        <Button variant="plain" size="icon" icon={<IconChevronRight size={18} />} ariaLabel="메뉴" onClick={() => setSidebarOpen(true)} style={{ display: "none" }} className="sb-toggle" />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.01em", whiteSpace: "nowrap", wordBreak: "keep-all" }}>{contextBarTitle}</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setCmdOpen(true)} style={{
          display: "flex", alignItems: "center", gap: 8,
          height: 34, padding: "0 12px", borderRadius: 10,
          background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--text-3)", fontSize: 12.5, cursor: "pointer", minWidth: 200,
        }} className="cmd-trigger">
          <IconSearch size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>검색...</span>
          <span className="mono" style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--bg-2)", border: "1px solid var(--border)" }}>⌘K</span>
        </button>
        <Button variant="ghost" size="icon" icon={<IconBell size={16} />} ariaLabel="알림" />
      </header>

      <main style={{ marginLeft: 232, padding: "28px 28px 56px" }} className="app-main">
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          {screen}
        </div>
      </main>

      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} navigate={navigate} state={state} />}

      {/* Tweaks panel */}
      <TweaksPanel>
        <TweakSection title="테마">
          <TweakRadio label="컬러 모드" value={tweaks.theme} onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "aurora", label: "Aurora" },
              { value: "iris", label: "Iris" },
              { value: "mono", label: "Mono" },
            ]} />
          <TweakToggle label="배경 글로우" value={tweaks.ambient} onChange={(v) => setTweak("ambient", v)} />
        </TweakSection>
      </TweaksPanel>

      <style>{`
        @media (max-width: 880px) {
          .app-sidebar { transform: translateX(-100%); }
          .app-sidebar.open { transform: translateX(0); }
          .app-context { margin-left: 0 !important; padding: 0 16px !important; }
          .app-main { margin-left: 0 !important; padding: 20px 16px 40px !important; }
          .sb-toggle { display: inline-flex !important; }
          .cmd-trigger { min-width: 0 !important; }
        }
      `}</style>
    </>
  );
}

function CommandPalette({ onClose, navigate, state }) {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const base = [
      { kind: "nav", label: "대시보드로", icon: <IconHome size={14} />, action: () => navigate("dashboard") },
      { kind: "nav", label: "새 토픽 만들기", icon: <IconPlus size={14} />, action: () => navigate("topic-new") },
      { kind: "nav", label: "Trend Scout", icon: <IconRadar size={14} />, action: () => navigate("trends", { topicId: state.topics[0]?.id }) },
      { kind: "nav", label: "설정", icon: <IconSettings size={14} />, action: () => navigate("settings") },
      ...state.posts.map(p => ({ kind: "post", label: p.title, hint: STEP_LABEL[p.workflowStep], icon: <IconWorkflow size={14} />, action: () => navigate("workflow", { postId: p.id }) })),
      ...state.topics.map(t => ({ kind: "topic", label: t.rawTopic, hint: "Topic", icon: <IconSparkle size={14} />, action: () => navigate("trends", { topicId: t.id }) })),
    ];
    return q ? base.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : base;
  }, [q, state, navigate]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "10vh", padding: "10vh 16px 16px",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong fade-in" style={{ width: "100%", maxWidth: 560, overflow: "hidden", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <IconSearch size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="페이지, 토픽, 글 검색..." style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--text-1)", fontSize: 14, fontFamily: "inherit",
          }} />
          <span className="mono" style={{ fontSize: 10.5, padding: "2px 6px", borderRadius: 4, background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-4)" }}>ESC</span>
        </div>
        <div style={{ maxHeight: "50vh", overflowY: "auto", padding: 6 }}>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-3)" }}>결과 없음</div>
          ) : items.map((item, i) => (
            <button key={i} onClick={() => { item.action(); onClose(); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-2)", fontSize: 13, textAlign: "left",
              transition: "background .1s",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface)"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}>
              <span style={{ color: "var(--accent)", display: "flex" }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.hint && <Badge tone="muted">{item.hint}</Badge>}
              <IconArrowRight size={12} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
