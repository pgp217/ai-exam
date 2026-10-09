"use client";

import { useState } from "react";
import { SURVEY_QUESTIONS, SURVEY_TEXT_MAX, type SurveyQuestionId } from "@/lib/survey/survey";

// 응시 후 설문 (선택). 제출하면 감사 문구로 바뀐다.
export default function SurveyForm({ token, done: initiallyDone }: { token: string; done: boolean }) {
  const [answers, setAnswers] = useState<Partial<Record<SurveyQuestionId, number>>>({});
  const [hadIssue, setHadIssue] = useState<boolean | null>(null);
  const [issue, setIssue] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initiallyDone);

  if (done) {
    return <p className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">설문에 답해 주셔서 감사합니다. 시험을 개선하는 데 쓰겠습니다.</p>;
  }

  const complete = SURVEY_QUESTIONS.every((q) => answers[q.id]) && hadIssue !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) {
      setError("모든 문항에 답해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${encodeURIComponent(token)}/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, had_issue: hadIssue, issue: hadIssue ? issue : null, comment }),
      });
      if (res.status === 409) {
        setDone(true); // 이미 냄
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "보내지 못했습니다.");
      setDone(true);
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "보내지 못했습니다."} 잠시 뒤 다시 시도해 주세요.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800" aria-labelledby="survey-title">
      <div>
        <h2 id="survey-title" className="font-semibold">응시 후 설문 (선택, 1분)</h2>
        <p className="mt-1 text-sm text-zinc-500">점수에는 반영되지 않습니다. 시험을 개선하는 데만 씁니다.</p>
      </div>
      {SURVEY_QUESTIONS.map((q, i) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="text-sm font-medium">{i + 1}. {q.text}</legend>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-16 text-right">{q.low}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex flex-col items-center gap-1">
                <input
                  type="radio"
                  name={q.id}
                  value={n}
                  checked={answers[q.id] === n}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                  className="size-5"
                  aria-label={`${q.text} ${n}점`}
                />
                <span>{n}</span>
              </label>
            ))}
            <span className="w-16">{q.high}</span>
          </div>
        </fieldset>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{SURVEY_QUESTIONS.length + 1}. 응시 중 오류나 불편한 점이 있었나요?</legend>
        <div className="flex gap-4 text-sm">
          {[["없었다", false], ["있었다", true]].map(([label, v]) => (
            <label key={String(v)} className="flex items-center gap-1.5">
              <input type="radio" name="had_issue" checked={hadIssue === v} onChange={() => setHadIssue(v as boolean)} className="size-4" />
              {label}
            </label>
          ))}
        </div>
        {hadIssue && (
          <textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            maxLength={SURVEY_TEXT_MAX}
            rows={3}
            placeholder="언제, 어떤 화면에서, 무슨 일이 있었는지 적어 주세요."
            aria-label="오류·불편 내용"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        )}
      </fieldset>
      <label className="block space-y-2">
        <span className="text-sm font-medium">{SURVEY_QUESTIONS.length + 2}. 그 밖에 하고 싶은 말 (선택)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={SURVEY_TEXT_MAX}
          rows={3}
          placeholder="헷갈렸던 문항, 좋았던 점 등"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {busy ? "보내는 중…" : "설문 보내기"}
        </button>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </form>
  );
}
