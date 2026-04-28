import Link from "next/link";

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/topics/new", label: "토픽 입력" },
  { href: "/settings/blog-profile", label: "BlogProfile 설정" },
  { href: "/settings/provider", label: "Provider 설정" },
];

export function AppNav() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">로컬 블로그 자동 작성기 MVP</p>
          <p className="text-xs text-slate-500">자동 발행 제외 / 승인 기반 워크플로우</p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
