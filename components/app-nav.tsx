import Link from "next/link";

const navItems = [
  { href: "/", label: "대시보드", icon: "⌂" },
  { href: "/topics/new", label: "새 토픽", icon: "+" },
  { href: "/topics/ideas", label: "추천 칼럼", icon: "I" },
  { href: "/settings/blog-profile", label: "BlogProfile", icon: "B" },
  { href: "/settings/provider", label: "Provider", icon: "P" },
] as const;

export function AppNav() {
  return (
    <aside className="app-sidebar flex flex-col gap-2 p-4">
      <Link
        href="/"
        className="mb-3 flex items-center gap-3 border-b border-slate-200 px-2 pb-4"
      >
        <span className="brand-mark">R</span>
        <span className="min-w-0">
          <span className="block text-sm font-bold tracking-tight text-slate-900">REFUSE HUB</span>
          <span className="block text-[11px] text-slate-500">Local Writer MVP</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="nav-link">
            <span className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-900">Safety Guard</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          자동 발행 없이 검수와 Export까지만 처리합니다.
        </p>
      </div>
    </aside>
  );
}
