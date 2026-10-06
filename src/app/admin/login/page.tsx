import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdmin, MEMORY_ADMIN } from "@/lib/admin/auth";
import { storeMode } from "@/lib/attempt/store";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "관리자 로그인 | 신입사원 AI 역량 시험", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin/grading");
  const demo = process.env.NODE_ENV !== "production" && storeMode() === "memory";
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <p className="text-sm text-zinc-500">신입사원 AI 역량 시험</p>
        <h1 className="mt-1 text-2xl font-bold">관리자 로그인</h1>
      </div>
      <LoginForm />
      {demo && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          개발용 메모리 저장소 모드입니다. 데모 관리자: {MEMORY_ADMIN.email} / {MEMORY_ADMIN.password}
        </p>
      )}
    </main>
  );
}
