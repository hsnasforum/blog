// ============ Topic New screen ============

function TopicNewScreen({ navigate, dispatch }) {
  const [rawTopic, setRawTopic] = useState("");
  const [memo, setMemo] = useState("");
  const [audience, setAudience] = useState("default");
  const [submitting, setSubmitting] = useState(false);

  const samples = [
    "1인 개발자를 위한 AI 자동화 도구",
    "Notion vs Obsidian 2026 선택 가이드",
    "사이드 프로젝트 수익화 패턴",
    "M5 MacBook Pro 실사용 7일 리뷰",
  ];

  function submit() {
    if (!rawTopic.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      const t = dispatch.createTopic({ rawTopic: rawTopic.trim(), memo: memo.trim() || null });
      setSubmitting(false);
      navigate("trends", { topicId: t.id });
    }, 1200);
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720, marginInline: "auto", width: "100%" }}>
      <div>
        <Badge tone="accent" dot>새 토픽</Badge>
        <h1 style={{ margin: "10px 0 6px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>무엇에 대해 써볼까요?</h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-3)" }}>키워드 한 줄로 시작하면 Trend Scout이 8~12개 후보를 만들고 점수를 매겨드려요.</p>
      </div>

      <Card padding={24}>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>rawTopic <span style={{ color: "var(--danger)" }}>*</span></label>
        <Textarea value={rawTopic} onChange={(e) => setRawTopic(e.target.value)} placeholder="예: AI 코드 리뷰 도구를 1인 개발자가 어떻게 쓰면 좋을까" minHeight={88} />

        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-4)", alignSelf: "center", marginRight: 4 }}>예시</span>
          {samples.map(s => (
            <button key={s} onClick={() => setRawTopic(s)} style={{
              fontSize: 11.5, padding: "4px 10px", borderRadius: 999,
              background: "var(--bg-1)", border: "1px solid var(--border)",
              color: "var(--text-3)", cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", margin: "20px 0 8px" }}>memo <span style={{ color: "var(--text-4)", fontWeight: 400 }}>(선택)</span></label>
        <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="배경 정보, 1차 출처 후보, 톤 메모 등" minHeight={64} />

        <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "var(--bg-1)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <IconShield size={14} /> 자동 발행 OFF · 모든 단계는 승인이 필요합니다
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => navigate("dashboard")}>취소</Button>
          <Button variant="primary" disabled={!rawTopic.trim()} loading={submitting} icon={<IconSparkle size={14} />} onClick={submit}>
            {submitting ? "토픽 생성 중..." : "토픽 만들고 스캔 시작"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

window.TopicNewScreen = TopicNewScreen;
