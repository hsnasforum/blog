import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/components/app-nav";

export const metadata: Metadata = {
  title: "로컬 블로그 자동 작성기 MVP",
  description: "Trend Scout + Draft + Review 승인형 글 작성 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <div className="app-shell">
          <AppNav />
          <div className="app-content">
            <header className="app-topbar">
              <div>
                <p className="text-sm font-semibold text-slate-900">Local Writer Console</p>
                <p className="text-xs text-slate-500">Trend Scout · Draft · Review · Export</p>
              </div>
              <div className="hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 sm:block">
                localhost 전용 승인 워크플로우
              </div>
            </header>
            <main className="app-main">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
