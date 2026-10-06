"use client";

import { useActionState } from "react";
import { setStatusAction, type ExamFormState } from "../actions";
import { FormMessage } from "../fields";

const initial: ExamFormState = { ok: false, message: null };

export default function StatusControl({ examId, status, blockers }: { examId: string; status: "draft" | "open" | "closed"; blockers: string[] }) {
  const [state, action, pending] = useActionState(setStatusAction, initial);
  const button = (to: string, label: string, primary = false, disabled = false) => (
    <button
      type="submit" name="status" value={to} disabled={pending || disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${primary ? "bg-emerald-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="examId" value={examId} />
        {status !== "open" && button("open", status === "closed" ? "다시 열기" : "시험 열기", true, blockers.length > 0)}
        {status === "open" && button("closed", "마감하기")}
        {status === "closed" && button("draft", "초안으로")}
        <FormMessage ok={state.ok} message={state.message} />
      </form>
      {status !== "open" && blockers.length > 0 && (
        <ul className="text-xs text-amber-700">{blockers.map((b) => <li key={b}>· {b}</li>)}</ul>
      )}
    </div>
  );
}
