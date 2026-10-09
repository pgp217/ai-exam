"use client";

import { useActionState, useState } from "react";
import { saveSiteAction, type ExamFormState } from "../../actions";
import { Field, FormMessage, inputClass } from "../../fields";

const initial: ExamFormState = { ok: false, message: null };

interface Props {
  examId: string;
  values: { time_limit_min: number; intro_text: string; show_result: boolean; collect_survey: boolean };
  started: boolean;
}

export default function SiteForm({ examId, values, started }: Props) {
  const [state, action, pending] = useActionState(saveSiteAction, initial);
  const [intro, setIntro] = useState(values.intro_text);
  const f = state.fields ?? {};
  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <input type="hidden" name="examId" value={examId} />
        <Field label="제한 시간 (분)" name="time_limit_min" error={f.time_limit_min} hint={started ? "응시를 시작한 사람이 있어 바꿀 수 없습니다." : "권장 40분 (객관식 24 · 자기평가 8 · 서술형 3)"}>
          <input id="time_limit_min" name="time_limit_min" type="number" min={5} max={240} defaultValue={state.values?.time_limit_min ?? values.time_limit_min} readOnly={started} className={`${inputClass} max-w-32`} />
        </Field>
        <Field label="응시 안내 문구" name="intro_text" error={f.intro_text} hint={`응시자가 시작 전에 보는 문구입니다. ${intro.length}/2000자`}>
          <textarea id="intro_text" name="intro_text" rows={6} maxLength={2000} value={intro} onChange={(e) => setIntro(e.target.value)} className={inputClass} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="show_result" defaultChecked={state.values ? state.values.show_result === "on" : values.show_result} className="mt-0.5 size-4" />
          <span>
            <strong>응시자에게 결과 리포트 공개</strong>
            <span className="block text-zinc-500">서술형 채점이 모두 확정되면 응시 링크에서 개인 리포트를 볼 수 있습니다. 끄면 담당자만 봅니다.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="collect_survey" defaultChecked={state.values ? state.values.collect_survey === "on" : values.collect_survey} className="mt-0.5 size-4" />
          <span>
            <strong>응시 후 설문 받기</strong>
            <span className="block text-zinc-500">제출한 응시자에게 난이도·시간·문항 이해도 등 짧은 설문(선택)을 받습니다. 파일럿 운영이나 문항 개선에 씁니다.</span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{pending ? "저장 중…" : "저장"}</button>
          <FormMessage ok={state.ok} message={state.message} />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-zinc-500">응시자 안내 화면 미리보기</p>
        <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">홍길동 님</p>
          {intro.trim() ? <p className="mt-3 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{intro}</p> : <p className="mt-3 text-sm text-zinc-400">(안내 문구 없음)</p>}
          <p className="mt-4 text-xs text-zinc-500">아래에 제한 시간·문항 수, 응시 규칙, 동의 체크가 이어서 표시됩니다.</p>
        </div>
      </div>
    </form>
  );
}
