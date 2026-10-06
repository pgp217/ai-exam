"use client";

import { useActionState } from "react";
import { runAiGradingAction, type FormState } from "../../../actions";

const initial: FormState = { ok: false, message: null };

export default function RunAiButton({ attemptId, itemId, force, label }: { attemptId: string; itemId?: string; force?: boolean; label: string }) {
  const [state, action, pending] = useActionState(runAiGradingAction, initial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="attemptId" value={attemptId} />
      {itemId && <input type="hidden" name="itemId" value={itemId} />}
      {force && <input type="hidden" name="force" value="1" />}
      <button type="submit" disabled={pending} className="rounded border border-current px-2 py-1 text-xs font-medium disabled:opacity-50">
        {pending ? "AI 채점 중…" : label}
      </button>
      {state.message && <span className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}
