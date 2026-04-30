// ============ Reusable UI primitives ============

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Pill / Badge
const Badge = ({ tone = "muted", children, dot = false, mono = false, soft = true, style }) => {
  const palette = {
    success: { fg: "var(--success)", bg: "color-mix(in oklch, var(--success) 14%, transparent)", bd: "color-mix(in oklch, var(--success) 35%, transparent)" },
    info:    { fg: "var(--info)",    bg: "color-mix(in oklch, var(--info) 14%, transparent)",    bd: "color-mix(in oklch, var(--info) 35%, transparent)" },
    warn:    { fg: "var(--warn)",    bg: "color-mix(in oklch, var(--warn) 14%, transparent)",    bd: "color-mix(in oklch, var(--warn) 35%, transparent)" },
    danger:  { fg: "var(--danger)",  bg: "color-mix(in oklch, var(--danger) 14%, transparent)",  bd: "color-mix(in oklch, var(--danger) 35%, transparent)" },
    accent:  { fg: "var(--accent)",  bg: "color-mix(in oklch, var(--accent) 14%, transparent)",  bd: "color-mix(in oklch, var(--accent) 35%, transparent)" },
    muted:   { fg: "var(--text-3)",  bg: "color-mix(in oklch, var(--text-3) 10%, transparent)",  bd: "var(--border)" },
  }[tone] || { fg: "var(--text-3)", bg: "transparent", bd: "var(--border)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px", borderRadius: 999,
      fontSize: 11.5, fontWeight: 600, letterSpacing: "-0.01em",
      color: palette.fg,
      background: soft ? palette.bg : "transparent",
      border: `1px solid ${palette.bd}`,
      fontFamily: mono ? "var(--font-mono)" : "inherit",
      whiteSpace: "nowrap",
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: palette.fg, boxShadow: `0 0 8px ${palette.fg}` }} />}
      {children}
    </span>
  );
};

// Button
const Button = ({ variant = "ghost", size = "md", icon, iconRight, children, onClick, disabled, type = "button", style, full, ariaLabel, loading }) => {
  const sizes = {
    sm: { pad: "6px 10px", fs: 12.5, h: 30, gap: 6 },
    md: { pad: "8px 14px", fs: 13.5, h: 36, gap: 8 },
    lg: { pad: "12px 20px", fs: 14.5, h: 44, gap: 10 },
    icon: { pad: 0, fs: 13, h: 32, w: 32, gap: 0 },
  }[size] || { pad: "8px 14px", fs: 13.5, h: 36, gap: 8 };

  const variants = {
    primary: {
      bg: "linear-gradient(135deg, var(--accent), var(--accent-2))",
      color: "var(--bg-0)",
      border: "1px solid color-mix(in oklch, var(--accent) 50%, transparent)",
      shadow: "0 4px 14px color-mix(in oklch, var(--accent) 30%, transparent), 0 0 0 1px color-mix(in oklch, var(--accent) 30%, transparent) inset",
      fontWeight: 700,
    },
    solid: {
      bg: "var(--surface-strong)",
      color: "var(--text-1)",
      border: "1px solid var(--border-strong)",
      shadow: "var(--shadow-sm)",
      fontWeight: 600,
    },
    ghost: {
      bg: "var(--surface)",
      color: "var(--text-2)",
      border: "1px solid var(--border)",
      shadow: "none",
      fontWeight: 500,
    },
    plain: {
      bg: "transparent",
      color: "var(--text-2)",
      border: "1px solid transparent",
      shadow: "none",
      fontWeight: 500,
    },
    danger: {
      bg: "color-mix(in oklch, var(--danger) 14%, transparent)",
      color: "var(--danger)",
      border: "1px solid color-mix(in oklch, var(--danger) 35%, transparent)",
      shadow: "none",
      fontWeight: 600,
    },
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: sizes.gap,
        padding: size === "icon" ? 0 : sizes.pad,
        height: sizes.h,
        width: size === "icon" ? sizes.w : (full ? "100%" : "auto"),
        fontSize: sizes.fs,
        fontWeight: variants.fontWeight,
        letterSpacing: "-0.01em",
        color: variants.color,
        background: variants.bg,
        border: variants.border,
        borderRadius: 10,
        boxShadow: variants.shadow,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "transform .12s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease",
        backdropFilter: variant === "ghost" ? "blur(12px)" : "none",
        WebkitBackdropFilter: variant === "ghost" ? "blur(12px)" : "none",
        whiteSpace: "nowrap",
        ...style,
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.97)"}
      onMouseUp={(e) => e.currentTarget.style.transform = ""}
      onMouseLeave={(e) => e.currentTarget.style.transform = ""}
    >
      {loading ? <Spinner size={size === "lg" ? 16 : 14} /> : icon}
      {children && <span>{children}</span>}
      {iconRight}
    </button>
  );
};

const Spinner = ({ size = 14 }) => (
  <span style={{
    width: size, height: size, borderRadius: 999,
    border: `2px solid currentColor`, borderTopColor: "transparent",
    animation: "spin 0.7s linear infinite", display: "inline-block",
  }} />
);

const styleSheet = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulseDot {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.05); }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes typeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 50%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in oklch, var(--accent) 0%, transparent); }
}
.fade-in { animation: slideUp .35s cubic-bezier(.2,.8,.2,1) both; }
.shimmer-bg {
  background: linear-gradient(90deg, transparent 0%, color-mix(in oklch, var(--accent) 20%, transparent) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
`;

// Card
const Card = ({ children, padding = 20, style, glow = false, hover = false, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: "var(--surface)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding,
      boxShadow: glow ? "0 24px 64px color-mix(in oklch, var(--accent) 12%, rgba(0,0,0,.3)), 0 0 0 1px var(--border) inset" : "var(--shadow-sm)",
      cursor: onClick ? "pointer" : "default",
      transition: "transform .2s ease, box-shadow .2s ease, border-color .2s ease",
      ...(hover && { ":hover": { transform: "translateY(-2px)" } }),
      ...style,
    }}
    onMouseEnter={hover ? (e) => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.borderColor = "var(--border-strong)";
    } : undefined}
    onMouseLeave={hover ? (e) => {
      e.currentTarget.style.transform = "";
      e.currentTarget.style.borderColor = "";
    } : undefined}
  >
    {children}
  </div>
);

// Input
const Input = ({ value, onChange, placeholder, type = "text", icon, full = true, style, ...rest }) => (
  <label style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "0 12px",
    height: 38,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    transition: "border-color .15s, box-shadow .15s",
    width: full ? "100%" : "auto",
    ...style,
  }} className="input-wrap">
    {icon && <span style={{ color: "var(--text-3)", display: "flex" }}>{icon}</span>}
    <input
      type={type}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        flex: 1, minWidth: 0,
        background: "transparent", border: "none", outline: "none",
        color: "var(--text-1)",
        fontSize: 13.5,
        fontFamily: "inherit",
      }}
      {...rest}
    />
  </label>
);

const Textarea = ({ value, onChange, placeholder, minHeight = 80, mono = false, style, ...rest }) => (
  <textarea
    value={value ?? ""}
    onChange={onChange}
    placeholder={placeholder}
    style={{
      width: "100%",
      minHeight,
      padding: "10px 12px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      color: "var(--text-1)",
      fontSize: mono ? 12.5 : 13.5,
      fontFamily: mono ? "var(--font-mono)" : "inherit",
      lineHeight: 1.65,
      resize: "vertical",
      outline: "none",
      transition: "border-color .15s, box-shadow .15s",
      ...style,
    }}
    onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px color-mix(in oklch, var(--accent) 18%, transparent)"; }}
    onBlur={(e) => { e.target.style.borderColor = ""; e.target.style.boxShadow = ""; }}
    {...rest}
  />
);

// Section header
const SectionHeader = ({ icon, title, subtitle, action }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {icon && <span style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 8,
        background: "color-mix(in oklch, var(--accent) 14%, transparent)",
        color: "var(--accent)",
      }}>{icon}</span>}
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-1)" }}>{title}</h2>
        {subtitle && <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--text-3)" }}>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

// Stat card
const Stat = ({ label, value, hint, tone = "muted", icon, trend }) => {
  const toneFg = {
    success: "var(--success)", info: "var(--info)", warn: "var(--warn)",
    danger: "var(--danger)", accent: "var(--accent)", muted: "var(--text-1)",
  }[tone];
  return (
    <Card padding={16} style={{ position: "relative", overflow: "hidden", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500, whiteSpace: "nowrap", wordBreak: "keep-all" }}>{label}</span>
        {icon && <span style={{ color: "var(--text-4)", flexShrink: 0 }}>{icon}</span>}
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: toneFg, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</span>
        {trend && <span style={{ fontSize: 11.5, color: trend.startsWith("+") ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>{trend}</span>}
      </div>
      {hint && <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-4)" }}>{hint}</p>}
    </Card>
  );
};

// Workflow step pill row
const StepTrack = ({ active, size = "md" }) => {
  const idx = STEP_ORDER.indexOf(active);
  const small = size === "sm";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: small ? 4 : 6 }}>
      {STEP_ORDER.map((step, i) => {
        const isPast = i < idx;
        const isActive = i === idx;
        const isFuture = i > idx;
        const fg = isPast ? "var(--success)" : isActive ? "var(--accent)" : "var(--text-4)";
        const bg = isPast ? "color-mix(in oklch, var(--success) 14%, transparent)"
                  : isActive ? "color-mix(in oklch, var(--accent) 18%, transparent)"
                  : "transparent";
        const bd = isPast ? "color-mix(in oklch, var(--success) 35%, transparent)"
                  : isActive ? "color-mix(in oklch, var(--accent) 45%, transparent)"
                  : "var(--border)";
        return (
          <React.Fragment key={step}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: small ? "2px 7px" : "4px 10px",
              fontSize: small ? 10.5 : 11.5,
              fontWeight: 600,
              color: fg, background: bg, border: `1px solid ${bd}`, borderRadius: 999,
              animation: isActive ? "glowPulse 2s infinite" : "none",
            }}>
              {isPast ? <IconCheck size={small ? 9 : 10} /> : isActive ? <span style={{ width: 5, height: 5, borderRadius: 999, background: fg, animation: "pulseDot 1.6s infinite" }} /> : <span style={{ width: 5, height: 5, borderRadius: 999, background: fg }} />}
              {STEP_LABEL[step]}
            </span>
            {i < STEP_ORDER.length - 1 && <span style={{ width: small ? 6 : 10, height: 1, background: i < idx ? "var(--success)" : "var(--border)" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Score gauge — circular
const ScoreGauge = ({ score = 0, size = 64, label }) => {
  const tone = score >= 80 ? "success" : score >= 65 ? "info" : score >= 50 ? "warn" : "danger";
  const fg = { success: "var(--success)", info: "var(--info)", warn: "var(--warn)", danger: "var(--danger)" }[tone];
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--border)" strokeWidth="4" fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={fg} strokeWidth="4" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)", filter: `drop-shadow(0 0 6px ${fg})` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="mono" style={{ fontSize: size * 0.32, fontWeight: 700, color: fg, lineHeight: 1, letterSpacing: "-0.02em" }}>{score}</span>
        {label && <span style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>}
      </div>
    </div>
  );
};

// Progress bar
const ProgressBar = ({ value, tone = "accent", height = 6, label }) => {
  const fg = { success: "var(--success)", info: "var(--info)", warn: "var(--warn)", danger: "var(--danger)", accent: "var(--accent)" }[tone];
  return (
    <div>
      {label && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11.5, color: "var(--text-3)" }}>
        <span>{label}</span><span className="mono" style={{ color: fg, fontWeight: 600 }}>{value}</span>
      </div>}
      <div style={{ height, borderRadius: 999, background: "var(--bg-2)", overflow: "hidden", position: "relative" }}>
        <div style={{
          height: "100%", width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${fg}, color-mix(in oklch, ${fg} 60%, var(--accent-2)))`,
          borderRadius: 999,
          boxShadow: `0 0 12px ${fg}`,
          transition: "width .8s cubic-bezier(.2,.8,.2,1)",
        }} />
      </div>
    </div>
  );
};

// Empty state
const EmptyState = ({ icon, title, description, action }) => (
  <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-3)" }}>
    {icon && <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 56, height: 56, borderRadius: 16,
      background: "color-mix(in oklch, var(--accent) 10%, transparent)",
      color: "var(--accent)",
      marginBottom: 16,
    }}>{icon}</div>}
    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{title}</h3>
    {description && <p style={{ margin: "6px 0 16px", fontSize: 13, maxWidth: 320, marginInline: "auto" }}>{description}</p>}
    {action}
  </div>
);

// Toast
const Toast = ({ message, tone = "success", onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const fg = { success: "var(--success)", warn: "var(--warn)", danger: "var(--danger)", info: "var(--info)" }[tone];
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200,
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 16px",
      background: "var(--surface-strong)",
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      border: `1px solid ${fg}`,
      borderRadius: 12,
      boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 4px color-mix(in oklch, ${fg} 14%, transparent)`,
      color: "var(--text-1)", fontSize: 13, fontWeight: 500,
      animation: "slideUp .3s cubic-bezier(.2,.8,.2,1)",
    }}>
      <span style={{ color: fg, display: "flex" }}>
        {tone === "success" ? <IconCheck size={16} /> : tone === "warn" ? <IconAlert size={16} /> : <IconBolt size={16} />}
      </span>
      {message}
    </div>
  );
};

// Style injection
function StyleInjector() {
  useEffect(() => {
    const id = "ui-keyframes";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = styleSheet;
      document.head.appendChild(s);
    }
  }, []);
  return null;
}

Object.assign(window, {
  Badge, Button, Spinner, Card, Input, Textarea, SectionHeader, Stat,
  StepTrack, ScoreGauge, ProgressBar, EmptyState, Toast, StyleInjector,
});
