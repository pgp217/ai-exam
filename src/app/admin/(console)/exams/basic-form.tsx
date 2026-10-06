"use client";

import { useActionState } from "react";
import { createExamAction, saveBasicAction, type ExamFormState } from "./actions";
import { Field, FormMessage, inputClass } from "./fields";

const initial: ExamFormState = { ok: false, message: null };

interface Props {
  examId?: string; // 없으면 새 시험
  values?: { title: string; starts: string; ends: string };
}

export default function BasicForm({ examId, values }: Props) {
  const [state, action, pending] = useActionState(examId ? saveBasicAction : createExamAction, initial);
  const f = state.fields ?? {};
  const v = state.values ?? values; // 저장에 실패하면 방금 입력한 값을 유지한다
  return (
    <form action={action} className="max-w-xl space-y-4">
      {examId && <input type="hidden" name="examId" value={examId} />}
      <Field label="시험명" name="title" error={f.title}>
        <input id="title" name="title" defaultValue={v?.title} maxLength={100} required placeholder="예: 2026 하반기 신입사원 AI 역량 시험" className={inputClass} aria-invalid={!!f.title} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="응시 시작 (한국 시간)" name="starts" error={f.starts}>
          <input id="starts" name="starts" type="datetime-local" defaultValue={v?.starts} required className={inputClass} aria-invalid={!!f.starts} />
        </Field>
        <Field label="응시 마감 (한국 시간)" name="ends" error={f.ends} hint="마감 시각이 지나면 시작하지 않은 사람은 응시할 수 없습니다.">
          <input id="ends" name="ends" type="datetime-local" defaultValue={v?.ends} required className={inputClass} aria-invalid={!!f.ends} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {pending ? "저장 중…" : examId ? "저장" : "만들고 다음 단계로"}
        </button>
        <FormMessage ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}
