// ============ Workflow screen — fake AI generation ============

function WorkflowScreen({ state, navigate, dispatch }) {
  const post = state.posts.find(p => p.id === state.activePostId) || state.posts[0];
  const topic = state.topics.find(t => t.id === post.topicId);
  const candidate = state.candidates.find(c => c.id === post.candidateId);

  const [pending, setPending] = useState(null);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [toast, setToast] = useState(null);

  const canApprove = post.outline && post.draft && post.reviewReport && (post.workflowStep === "review" || post.workflowStep === "approved");

  async function streamGenerate(field, source, label, advanceStep) {
    setPending(label);
    setStreamBuffer("");
    const chunks = source.match(/.{1,30}/gs) || [];
    let acc = "";
    for (const chunk of chunks) {
      acc += chunk;
      setStreamBuffer(acc);
      await new Promise(r => setTimeout(r, 40 + Math.random() * 50));
    }
    dispatch.updatePost(post.id, { [field]: acc, workflowStep: advanceStep || post.workflowStep });
    setStreamBuffer("");
    setPending(null);
    setToast({ message: `${label} 완료`, tone: "success" });
  }

  const STUB_OUTLINE = `# 개요\n\n## 1. 도입\n- 시의성 있는 문제 제기\n- 페르소나(1인 개발자/주니어) 명시\n\n## 2. 핵심 정의\n- 정확한 용어 정리\n- 흔한 오해 1~2개\n\n## 3. 비교 / 분석\n- 표 또는 매트릭스\n- 출처 인용 (1차 자료 우선)\n\n## 4. 실무 적용\n- 사례 2~3개\n- 단계별 체크리스트\n\n## 5. 한계와 주의사항\n- 보안 / 라이선스\n- 흔히 빠지는 함정\n\n## 6. 결론 / CTA`;

  const STUB_DRAFT = `# 본문 초안\n\n도입부에서는 최근 커뮤니티에서 활발히 논의되는 ${candidate?.keyword ?? "주제"}을 시의성 있게 제시합니다. 1인 개발자 페르소나에게 와닿는 시작 — 어제 밤 막혔던 작업, 슬랙에서 본 대화 한 줄 — 으로 글을 엽니다.\n\n## 정의 정리\n\n핵심 용어를 정확히 짚습니다. 이 글에서 다룰 범위와 다루지 않을 범위를 1문단으로 명시합니다. 이렇게 하면 검색 의도가 명확한 독자가 바로 가치를 느낄 수 있고, 그렇지 않은 독자는 빨리 이탈해 평균 체류시간을 왜곡하지 않습니다.\n\n## 분석\n\n표 형태로 비교합니다. 각 행은 1차 출처와 함께 인용하며, 추정에 의존한 항목은 명시적으로 표시합니다.\n\n| 항목 | A | B |\n|---|---|---|\n| 비용 | ... | ... |\n| 학습곡선 | ... | ... |\n\n## 실무 적용\n\n3개의 시나리오로 나눠 설명합니다. 각 시나리오에 단계별 체크리스트를 첨부합니다.\n\n## 한계\n\n광고나 협찬 없이, 솔직한 한계를 정리합니다. 보안/라이선스/생산성 함정 — 직접 겪은 사례 2개 이상 인용.\n\n## 결론\n\n어떤 상황에서 시도하고 어떤 상황에서 피해야 하는지 의사결정 트리를 제시합니다. 다음 글로의 CTA를 자연스럽게 배치합니다.`;

  const STUB_REVIEW = `## 검수 결과 — review_first\n\n**전체 점수: 76 / 100**\n\n### ✅ 잘된 점\n- 도입부 시의성 있음\n- 표 비교가 명확하고 출처 표기 양호\n- 페르소나 일관성 유지\n\n### ⚠️ 개선 필요\n1. **3절 분석** — 추정에 의존한 항목이 2개 있음. 1차 출처 보강 필요.\n2. **5절 한계** — 보안 부분 추상적. CVE/실 사례 1개 인용 권장.\n3. **결론** — CTA 약함. 다음 글 후보 1~2개를 명시적으로 링크 권장.\n\n### 🚫 금칙어/규정\n- 통과. 광고성 표현, 미검증 통계 없음.\n\n### SEO\n- 타이틀 길이 양호\n- 메타 설명 누락\n- 내부 링크 0개`;

  function approve() {
    setPending("승인");
    setTimeout(() => {
      dispatch.updatePost(post.id, { workflowStep: "approved" });
      setPending(null);
      setToast({ message: "승인 완료 — Approved 단계로 전환됨", tone: "success" });
    }, 600);
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding={20}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ minWidth: 0, flex: "1 1 360px" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <Badge tone="accent" dot>Post Workflow</Badge>
              <Badge tone="muted" mono>{post.id}</Badge>
              <Badge tone="muted">{topic?.rawTopic}</Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{post.title}</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-3)" }}>{post.angle}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            <StepTrack active={post.workflowStep} />
            <span style={{ fontSize: 11, color: "var(--text-4)" }}>{fmtRelative(post.updatedAt)} 업데이트</span>
          </div>
        </div>
      </Card>

      {/* Action bar */}
      <Card padding={14}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Button variant="ghost" size="sm" icon={<IconDoc size={14} />} loading={pending==="개요 생성"} disabled={pending}
            onClick={() => streamGenerate("outline", STUB_OUTLINE, "개요 생성", "draft")}>
            개요 생성
          </Button>
          <Button variant="ghost" size="sm" icon={<IconSparkle size={14} />} loading={pending==="초안 생성"} disabled={pending}
            onClick={() => streamGenerate("draft", STUB_DRAFT, "초안 생성", "review")}>
            초안 생성
          </Button>
          <Button variant="solid" size="sm" icon={<IconShield size={14} />} loading={pending==="검수 실행"} disabled={pending}
            onClick={() => streamGenerate("reviewReport", STUB_REVIEW, "검수 실행")}>
            검수 실행
          </Button>
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="sm" icon={<IconCheck size={14} />} disabled={!canApprove || pending} loading={pending==="승인"} onClick={approve}>
            {post.workflowStep === "approved" ? "승인됨" : "승인 처리"}
          </Button>
        </div>
        {!canApprove && post.workflowStep !== "approved" && (
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--text-4)" }}>
            <IconAlert size={11} /> 개요·초안·검수 리포트가 모두 채워지고 검수 단계 이상이어야 승인할 수 있습니다.
          </p>
        )}
      </Card>

      {/* Editor area */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }} className="wf-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldCard title="제목" hint="검색 노출에 가장 큰 영향">
            <Input value={post.title} onChange={(e) => dispatch.updatePost(post.id, { title: e.target.value })} />
          </FieldCard>
          <FieldCard title="글 방향 (angle)" hint="이 글의 차별 포인트를 한두 문장으로">
            <Textarea value={post.angle ?? ""} onChange={(e) => dispatch.updatePost(post.id, { angle: e.target.value })} minHeight={70} />
          </FieldCard>
          <FieldCard title="개요 (outline)" hint="구조 — 섹션과 핵심 포인트">
            <Textarea mono value={pending === "개요 생성" ? streamBuffer : (post.outline ?? "")} onChange={(e) => dispatch.updatePost(post.id, { outline: e.target.value })} minHeight={200} placeholder="개요 생성 버튼을 누르거나 직접 입력하세요" />
          </FieldCard>
          <FieldCard title="초안 (draft)" hint="본문 — 검수 전 1차 작성본">
            <Textarea mono value={pending === "초안 생성" ? streamBuffer : (post.draft ?? "")} onChange={(e) => dispatch.updatePost(post.id, { draft: e.target.value })} minHeight={360} placeholder="개요가 준비되면 초안 생성을 실행하세요" />
          </FieldCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldCard title="검수 리포트" hint="자체 검수 + 금칙어/SEO 점검">
            <Textarea mono value={pending === "검수 실행" ? streamBuffer : (post.reviewReport ?? "")} onChange={(e) => dispatch.updatePost(post.id, { reviewReport: e.target.value })} minHeight={280} placeholder="초안 작성 후 검수 실행" />
          </FieldCard>
          <FieldCard title="SEO 패키지" hint="메타·키워드·OG 정보">
            <Textarea mono value={post.seoPackage ?? ""} onChange={(e) => dispatch.updatePost(post.id, { seoPackage: e.target.value })} minHeight={160} placeholder="title / description / og:image / keywords" />
          </FieldCard>
          <ExportPanel post={post} />
        </div>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}

      <style>{`
        @media (max-width: 1024px) {
          .wf-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function FieldCard({ title, hint, children }) {
  return (
    <Card padding={16}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>{title}</div>
        {hint && <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </Card>
  );
}

function ExportPanel({ post }) {
  const [copied, setCopied] = useState(false);
  function copyMarkdown() {
    const md = `# ${post.title}\n\n${post.angle ?? ""}\n\n${post.outline ?? ""}\n\n${post.draft ?? ""}`;
    navigator.clipboard?.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Card padding={16}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 10 }}>내보내기</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Button variant="ghost" size="sm" icon={<IconCopy size={13} />} onClick={copyMarkdown}>{copied ? "복사됨!" : "Markdown 복사"}</Button>
        <Button variant="ghost" size="sm" icon={<IconDownload size={13} />}>HTML 내보내기</Button>
        <Button variant="ghost" size="sm" icon={<IconArrowUpRight size={13} />}>DCInside 임포트</Button>
      </div>
    </Card>
  );
}

window.WorkflowScreen = WorkflowScreen;
