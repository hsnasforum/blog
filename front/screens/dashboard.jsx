// ============ Dashboard screen ============

function DashboardScreen({ state, navigate }) {
  const { topics, candidates, posts, logs, profile, provider } = state;

  const topCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => b.totalScore - a.totalScore).slice(0, 6);
  }, [candidates]);

  const recentPosts = useMemo(() => {
    return [...posts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4);
  }, [posts]);

  const stats = useMemo(() => {
    const writeNow = candidates.filter(c => c.verdict === "write_now").length;
    const inProgress = posts.filter(p => p.workflowStep !== "approved").length;
    const approved = posts.filter(p => p.workflowStep === "approved").length;
    return { topics: topics.length, writeNow, inProgress, approved };
  }, [topics, candidates, posts]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hero */}
      <div style={{
        position: "relative", overflow: "hidden",
        padding: "32px 28px",
        borderRadius: 20,
        border: "1px solid var(--border)",
        background: "linear-gradient(135deg, color-mix(in oklch, var(--accent) 8%, var(--surface)) 0%, var(--surface) 70%)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}>
        <div style={{
          position: "absolute", top: -80, right: -80, width: 280, height: 280, borderRadius: "50%",
          background: "var(--glow-1)", filter: "blur(80px)", opacity: 0.6, pointerEvents: "none",
        }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Badge tone="accent" dot>활성 워크스페이스</Badge>
              <Badge tone="muted" mono>{provider.provider} · {provider.model}</Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
              안녕하세요, <span style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{profile.ownerName}</span>님
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-2)", maxWidth: 560 }}>
              오늘 <strong style={{ color: "var(--accent)" }}>{stats.writeNow}개</strong>의 키워드가 <em style={{ fontStyle: "normal", color: "var(--text-1)" }}>바로 작성</em> 상태로 대기 중이에요.
              승인 대기 초안은 <strong style={{ color: "var(--info)" }}>{stats.inProgress}건</strong>입니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" icon={<IconRadar />} onClick={() => navigate("trends", { topicId: "t-101" })}>
              Trend Scout 보기
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={() => navigate("topic-new")}>
              새 토픽 만들기
            </Button>
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Stat label="활성 토픽" value={stats.topics} hint="최근 7일" icon={<IconSparkle />} tone="accent" />
        <Stat label="바로 작성 후보" value={stats.writeNow} trend="+3" hint="vs 지난주" icon={<IconBolt />} tone="success" />
        <Stat label="작업 중 초안" value={stats.inProgress} hint="검수/초안 합계" icon={<IconWorkflow />} tone="info" />
        <Stat label="이번 달 승인" value={stats.approved} hint="목표 8건 중" icon={<IconCheck />} tone="muted" />
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }} className="dash-grid">
        {/* Top candidates */}
        <Card padding={20}>
          <SectionHeader
            icon={<IconFlame size={16} />}
            title="상위 점수 키워드"
            subtitle="모든 토픽에서 점수순으로 정렬된 후보입니다"
            action={<Button variant="plain" size="sm" iconRight={<IconArrowRight size={14} />} onClick={() => navigate("trends", { topicId: "t-101" })}>전체 보기</Button>}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topCandidates.map(c => <CandidateRow key={c.id} candidate={c} topic={topics.find(t => t.id === c.topicId)} onClick={() => navigate("trends", { topicId: c.topicId })} />)}
          </div>
        </Card>

        {/* Sidebar — recent posts + activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card padding={20}>
            <SectionHeader icon={<IconWorkflow size={16} />} title="진행 중인 글" subtitle={`${recentPosts.length}건`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentPosts.map(p => (
                <button key={p.id} onClick={() => navigate("workflow", { postId: p.id })} style={{
                  textAlign: "left", padding: 12, borderRadius: 12,
                  background: "var(--bg-1)", border: "1px solid var(--border)",
                  cursor: "pointer", transition: "border-color .15s, transform .15s",
                  display: "flex", flexDirection: "column", gap: 8,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <StepTrack active={p.workflowStep} size="sm" />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-4)" }}>{fmtRelative(p.updatedAt)} 업데이트</div>
                </button>
              ))}
            </div>
          </Card>

          <Card padding={20}>
            <SectionHeader icon={<IconClock size={16} />} title="최근 활동" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
              {logs.map(log => (
                <div key={log.id} style={{ display: "flex", gap: 10, fontSize: 12 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 999, marginTop: 6, flexShrink: 0,
                    background: log.status === "success" ? "var(--success)" : log.status === "fallback" ? "var(--warn)" : "var(--danger)",
                    boxShadow: `0 0 6px ${log.status === "success" ? "var(--success)" : log.status === "fallback" ? "var(--warn)" : "var(--danger)"}`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--text-1)", fontWeight: 600 }}>{log.action}</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{fmtRelative(log.at)}</span>
                    </div>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>{log.output}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .dash-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function CandidateRow({ candidate, topic, onClick }) {
  const meta = VERDICT_META[candidate.verdict] || VERDICT_META.unscored;
  return (
    <button onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
      padding: "12px 14px", borderRadius: 12,
      background: "var(--bg-1)", border: "1px solid var(--border)",
      cursor: "pointer", textAlign: "left", transition: "transform .15s, border-color .15s",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.transform = "translateX(2px)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.transform = ""; }}>
      <ScoreGauge score={candidate.totalScore} size={48} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 3, letterSpacing: "-0.01em" }}>{candidate.keyword}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{candidate.rationale}</div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{topic?.rawTopic ?? "—"}</span>
          <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>·</span>
          {candidate.sources.slice(0, 2).map(s => <span key={s} style={{ fontSize: 10.5, color: "var(--text-4)" }}>{s}</span>)}
        </div>
      </div>
      <Badge tone={meta.tone} dot>{meta.label}</Badge>
      <IconChevronRight size={14} />
    </button>
  );
}

window.DashboardScreen = DashboardScreen;
