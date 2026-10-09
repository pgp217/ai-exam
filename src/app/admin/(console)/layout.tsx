import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { logoutAction } from "../actions";

export const metadata: Metadata = { title: "관리자 | 신입사원 AI 역량 시험", robots: { index: false, follow: false } };

// 레이아웃은 화면 이동 때 다시 렌더링되지 않으므로, 각 페이지와 Server Action 도 requireAdmin() 을 따로 호출한다
export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/admin/grading" className="font-semibold">AI 역량 시험 관리</Link>
          <nav className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/admin/exams" className="hover:text-zinc-900 dark:hover:text-zinc-100">시험 관리</Link>
            <Link href="/admin/grading" className="hover:text-zinc-900 dark:hover:text-zinc-100">서술형 채점</Link>
            <Link href="/admin/results" className="hover:text-zinc-900 dark:hover:text-zinc-100">결과 목록</Link>
            <Link href="/admin/surveys" className="hover:text-zinc-900 dark:hover:text-zinc-100">설문</Link>
            <Link href="/admin/analysis" className="hover:text-zinc-900 dark:hover:text-zinc-100">문항 분석</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{admin.name}</span>
            <form action={logoutAction}>
              <button type="submit" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
