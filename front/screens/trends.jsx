// ============ Trend Scout screen ============

function TrendsScreen({ state, navigate, dispatch }) {
  const { topics, candidates, profile } = state;
  const topic = state.activeTopicId ? topics.find(t => t.id === state.activeTopicId) : topics[0];
  const topicCandidates = candidates.filter(c => c.topicId === topic.id).sort((a,b) => b.totalScore - a.totalScore);

  const [scanning, setScanning] = useState(false);
  const [filterVerdict, setFilterVerdict] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const verdictCounts = useMemo(() => {
    const counts = { write_now: 0, review_first: 0, hold: 0, reject: 0 };
    topicCandidates.forEach(c => { counts[c.verdict] = (counts[c.verdict] || 0) + 1; });
    return counts;
  }, [topicCandidates]);

  const filtered = filterVerdict === "all" ? topicCandidates : topicCandidates.filter(c => c.verdict === filterVerdict);

  function rescan() {
    setScanning(true);
    setTimeout(() => setScanning(false), 2400);
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Topic context */}
      <Card padding={22}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <Badge tone="accent" dot>Trend Scout</Badge>
              <Badge tone="muted" mono>{topic.id}</Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{topic.rawTopic}</h1>
            {topic.memo && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-3)" }}>📝 {topic.memo}</p>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Button variant="ghost" icon={<IconLink />} size="sm">출처 추가</Button>
            <Button variant="primary" icon={scanning ? null : <IconRadar size={16} />} size="md" onClick={rescan} loading={scanning}>
              {scanning ? "스캔 중..." : "재스캔"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Verdict filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterChip active={filterVerdict === "all"} onClick={() => setFilterVerdict("all")} label="전체" count={topicCandidates.length} />
        <FilterChip active={filterVerdict === "write_now"} onClick={() => setFilterVerdict("write_now")} label="바로 작성" count={verdictCounts.write_now} tone="success" />
        <FilterChip active={filterVerdict === "review_first"} onClick={() => setFilterVerdict("review_first")} label="검토 후" count={verdictCounts.review_first} tone="info" />
        <FilterChip active={filterVerdict === "hold"} onClick={() => setFilterVerdict("hold")} label="보류" count={verdictCounts.hold} tone="warn" />
        <FilterChip active={filterVerdict === "reject"} onClick={() => setFilterVerdict("reject")} label="제외" count={verdictCounts.reject} tone="danger" />
      </div>

      {/* Scanning shimmer overlay */}
      {scanning && (
        <Card padding={16} style={{ position: "relative", overflow: "hidden" }}>
          <div className="shimmer-bg" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            <Spinner size={16} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>외부 신호 수집 중...</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Naver DataLab · Naver News · GitHub · Hacker News · Reddit</div>
            </div>
          </div>
        </Card>
      )}

      {/* Candidate cards grid */}
      {filtered.length === 0 ? (
        <Card padding={20}>
          <EmptyState icon={<IconSearch />} title="해당 verdict에 후보가 없습니다" description="다른 필터를 선택해보세요" />
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
          {filtered.map(c => <CandidateCard key={c.id} candidate={c} expanded={expanded === c.id} onToggle={() => setExpanded(expanded === c.id ? null : c.id)} navigate={navigate} dispatch={dispatch} />)}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count, tone = "muted" }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 999,
      fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.01em",
      background: active ? "var(--surface-strong)" : "transparent",
      color: active ? "var(--text-1)" : "var(--text-3)",
      border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
      cursor: "pointer",
      transition: "all .15s",
      whiteSpace: "nowrap", wordBreak: "keep-all", flexShrink: 0,
    }}>
      {label}
      <span className="mono" style={{
        fontSize: 11, padding: "1px 6px", borderRadius: 999,
        background: active ? `color-mix(in oklch, var(--${tone === "muted" ? "accent" : tone}) 20%, transparent)` : "var(--bg-2)",
        color: active ? `var(--${tone === "muted" ? "accent" : tone})` : "var(--text-4)",
      }}>{count}</span>
    </button>
  );
}

function CandidateCard({ candidate, expanded, onToggle, navigate, dispatch }) {
  const meta = VERDICT_META[candidate.verdict] || VERDICT_META.unscored;
  const subKeys = ["SG", "NV", "CH", "BF", "DF", "LS"];
  const subLabel = { SG: "Search", NV: "News", CH: "Heat", BF: "Fit", DF: "Diff", LS: "Life" };
  const subMax = 20;
  const [creating, setCreating] = useState(false);

  function createPost() {
    setCreating(true);
    setTimeout(() => {
      const newPost = dispatch.createPostFromCandidate(candidate);
      setCreating(false);
      navigate("workflow", { postId: newPost.id });
    }, 900);
  }

  return (
    <Card padding={0} style={{ overflow: "hidden", position: "relative" }} hover>
      {/* Verdict edge stripe */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
        background: meta.tone === "muted" ? "var(--text-4)" : `var(--${meta.tone})`,
        boxShadow: `0 0 12px var(--${meta.tone === "muted" ? "text-3" : meta.tone})`,
      }} />

      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <ScoreGauge score={candidate.totalScore} size={56} label="score" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <Badge tone={meta.tone} dot>{meta.label}</Badge>
              <Badge tone="muted">{candidate.basis === "external_data" ? "외부 데이터" : candidate.basis === "community_signal" ? "커뮤니티" : "추정 점수"}</Badge>
              <Badge tone="muted" mono>{candidate.confidence}</Badge>
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.01em", lineHeight: 1.35 }}>{candidate.keyword}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5 }}>{candidate.rationale}</p>
          </div>
        </div>

        {/* Sub-scores bars */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
          {subKeys.map(k => {
            const v = candidate.sub[k] ?? 0;
            const pct = (v / subMax) * 100;
            return (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-4)", marginBottom: 3 }}>
                  <span>{subLabel[k]}</span>
                  <span className="mono" style={{ color: "var(--text-2)" }}>{v}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: "var(--bg-2)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))", borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Sources */}
        {candidate.sources.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {candidate.sources.map(s => <Badge key={s} tone="muted" style={{ fontSize: 10.5 }}>{s}</Badge>)}
            <Badge tone="warn" style={{ fontSize: 10.5 }}><IconFlame size={10} /> Heat {candidate.heat}</Badge>
          </div>
        )}

        {/* Expandable: titles + angle */}
        {expanded && candidate.titles.length > 0 && (
          <div className="fade-in" style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "var(--bg-1)", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>추천 글 방향</div>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{candidate.angle}</p>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>제목 후보</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {candidate.titles.map((t, i) => (
                <li key={i} style={{ fontSize: 12.5, color: "var(--text-1)", lineHeight: 1.5, display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 11 }}>0{i+1}</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Button variant="plain" size="sm" onClick={onToggle} iconRight={<IconChevron size={12} style={{ transform: expanded ? "rotate(180deg)" : "" }} />}>
            {expanded ? "접기" : "상세 보기"}
          </Button>
          <div style={{ flex: 1 }} />
          {candidate.titles.length > 0 ? (
            <Button variant="primary" size="sm" icon={<IconSparkle size={14} />} loading={creating} onClick={createPost}>
              초안 만들기
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled>출처 부족</Button>
          )}
        </div>
      </div>
    </Card>
  );
}

window.TrendsScreen = TrendsScreen;
