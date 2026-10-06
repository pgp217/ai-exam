"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

const initial: FormState = { ok: false, message: null };

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">이메일</span>
        <input name="email" type="email" autoComplete="username" required defaultValue={state.email} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
      </label>
      <label className="block text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950" />
      </label>
      {state.message && <p className="text-sm text-red-600" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-zinc-900 py-2.5 font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
