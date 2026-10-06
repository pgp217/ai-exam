"use client";

import { useActionState } from "react";
import type { Feedback } from "@/lib/attempt/types";
import { regenerateFeedbackAction, saveFeedbackAction, type FormState } from "../../../actions";

const initial: FormState = { ok: false, message: null };
const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
const SLOTS = 3;

interface Props {
  attemptId: string;
  feedback: Feedback | null;
  canGenerate: boolean;
  chapters: { id: string; title: string }[];
  suggested: string[];
}

export default function FeedbackEditor({ attemptId, feedback, canGenerate, chapters, suggested }: Props) {
  const [genState, generate, generating] = useActionState(regenerateFeedbackAction, initial);
  // 새 초안이 오면 입력값과 저장 메시지를 새로 시작하도록 key 를 바꾼다
  const formKey = `${feedback?.generated_at ?? "none"}-${feedback?.status ?? ""}`;

  return (
    <section className="space-y-4 rounded-2xl border-2 border-dashed border-zinc-300 p-5 dark:border-zinc-700" aria-labelledby="fb-title">
      <header className="flex flex-wrap items-center gap-3">
        <h2 id="fb-title" className="text-lg font-bold">성장 피드백 확인</h2>
        {feedback?.status === "approved" && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">공개됨 · {feedback.approved_at && fmt.format(new Date(feedback.approved_at))}</span>}
        {feedback?.status === "draft" && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">초안 · 미공개</span>}
        {!feedback && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">없음</span>}
        {feedback?.stale && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">승인 뒤 점수가 바뀌었습니다 · 다시 생성 권장</span>}
        {feedback && <span className="text-xs text-zinc-500">{feedback.model} · {fmt.format(new Date(feedback.generated_at))}</span>}
        {canGenerate && (
          <form action={generate} className="ml-auto flex items-center gap-2">
            <input type="hidden" name="attemptId" value={attemptId} />
            <button type="submit" disabled={generating} className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-zinc-700">
              {generating ? "AI가 작성 중…" : feedback ? "AI로 다시 생성" : "AI로 초안 만들기"}
            </button>
          </form>
        )}
      </header>
      {genState.message && <p className={`text-sm ${genState.ok ? "text-emerald-700" : "text-red-600"}`}>{genState.message}</p>}
      {feedback?.model === "fake-feedback" && <p className="text-xs font-medium text-amber-700">개발용 가짜 피드백입니다. 실제 AI 문구가 아닙니다.</p>}

      <FeedbackForm key={formKey} attemptId={attemptId} feedback={feedback} chapters={chapters} suggested={suggested} />
    </section>
  );
}

function FeedbackForm({ attemptId, feedback, chapters, suggested }: Omit<Props, "canGenerate">) {
  const [saveState, save, saving] = useActionState(saveFeedbackAction, initial);
  const actions = Array.from({ length: SLOTS }, (_, i) => feedback?.actions[i] ?? { title: "", detail: "", chapter: suggested[i] ?? null });
  return (
    <form action={save} className="space-y-3">
      <input type="hidden" name="attemptId" value={attemptId} />
      <label className="block text-sm">
        <span className="font-medium">요약</span>
        <textarea name="summary" defaultValue={feedback?.summary ?? ""} rows={3} maxLength={1000} className="mt-1 w-full rounded-lg border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-950" />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {actions.map((a, i) => (
          <fieldset key={i} className="space-y-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <legend className="px-1 font-medium">실천 제안 {i + 1}</legend>
            <input name="title" defaultValue={a.title} maxLength={100} placeholder="제목" aria-label={`실천 제안 ${i + 1} 제목`} className="w-full rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
            <textarea name="detail" defaultValue={a.detail} rows={4} maxLength={1000} placeholder="다음 업무에서 해 볼 행동" aria-label={`실천 제안 ${i + 1} 내용`} className="w-full rounded border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-950" />
            <select name="chapter" defaultValue={a.chapter ?? ""} aria-label={`실천 제안 ${i + 1} 교재 장`} className="w-full rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">교재 장 없음</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </fieldset>
        ))}
      </div>
      <p className="text-xs text-zinc-500">제목이나 내용이 빈 제안은 저장하지 않습니다. 확인한 뒤 &quot;승인하고 공개&quot;를 눌러야 응시자에게 보입니다.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="intent" value="approve" disabled={saving} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          승인하고 공개
        </button>
        <button type="submit" name="intent" value="draft" disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700">
          임시 저장
        </button>
        {saveState.message && <span className={`text-sm ${saveState.ok ? "text-emerald-700" : "text-red-600"}`} role={saveState.ok ? "status" : "alert"}>{saveState.message}</span>}
      </div>
    </form>
  );
}
