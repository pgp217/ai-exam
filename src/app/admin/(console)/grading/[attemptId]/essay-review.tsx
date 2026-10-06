"use client";

import { useActionState, useState } from "react";
import type { Rubric } from "@/lib/exam/answer-key.data";
import type { EssayItem } from "@/lib/exam/items";
import { essayScoreFromCriteria } from "@/lib/exam/scoring";
import type { AiGradingRow, Evidence, FinalGradingRow } from "@/lib/attempt/types";
import { confirmGradingAction, type FormState } from "../../../actions";
import RunAiButton from "./run-ai-button";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
const initial: FormState = { ok: false, message: null };

interface Props {
  index: number;
  attemptId: string;
  item: EssayItem;
  rubric: Rubric;
  response: { text: string; pasted: boolean; responseMs: number | null } | null;
  ai: AiGradingRow | null;
  aiCount: number;
  aiIsFake: boolean;
  final: FinalGradingRow | null;
  canRunAi: boolean;
}

export default function EssayReview({ index, attemptId, item, rubric, response, ai, aiCount, aiIsFake, final, canRunAi }: Props) {
  const [state, action, pending] = useActionState(confirmGradingAction, initial);
  const [scores, setScores] = useState<Record<string, number>>(() => ({ ...(final?.criterion_scores ?? ai?.criterion_scores ?? {}) }));
  const [reason, setReason] = useState(final?.override_reason ?? "");

  const complete = rubric.criteria.every((c) => scores[c.key] >= 1);
  const differs = ai != null && rubric.criteria.some((c) => scores[c.key] !== ai.criterion_scores[c.key]);
  const preview = complete ? essayScoreFromCriteria(rubric, scores) : null;
  const text = response?.text ?? "";
  const verifiedQuotes = (ai?.evidence ?? []).filter((e) => e.verified).map((e) => e.quote);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800" aria-labelledby={`essay-${item.id}`}>
      <header className="flex flex-wrap items-center gap-3">
        <h2 id={`essay-${item.id}`} className="text-lg font-bold">
          서술형 {index}. {item.title}
        </h2>
        {final ? (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">확정 {final.score}점 · {fmt.format(new Date(final.confirmed_at))}</span>
        ) : (
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">미확정</span>
        )}
      </header>

      <details className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">상황과 질문 보기</summary>
        <p className="mt-2 whitespace-pre-line">{item.scenario}</p>
        <p className="mt-2 font-medium">{item.prompt}</p>
      </details>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>응답 원문 · {text.trim().length}자</span>
          {response?.responseMs != null && <span>· 작성 {Math.round(response.responseMs / 1000)}초</span>}
          {response?.pasted && <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600">붙여넣기 있음</span>}
          {verifiedQuotes.length > 0 && <span>· <mark className="bg-yellow-100 px-1 dark:bg-yellow-900">표시</mark>는 AI가 근거로 인용한 부분</span>}
        </div>
        <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 p-3 leading-relaxed dark:border-zinc-800">
          {text.trim() ? <Highlighted text={text} quotes={verifiedQuotes} /> : <span className="text-zinc-400">(답안 없음)</span>}
        </div>
      </div>

      {ai ? (
        <div className="flex flex-wrap items-start gap-3 rounded-lg bg-blue-50/60 p-3 text-sm dark:bg-blue-950/40">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              AI 1차 채점 {ai.score}점
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {ai.model} · {fmt.format(new Date(ai.created_at))}
                {aiCount > 1 && ` · ${aiCount}회 채점 중 최신`}
              </span>
            </p>
            {aiIsFake && <p className="mt-1 text-xs font-medium text-amber-700">개발용 가짜 채점입니다. 실제 AI 판정이 아닙니다.</p>}
            {ai.rationale && <p className="mt-1 text-zinc-700 dark:text-zinc-300">{ai.rationale}</p>}
          </div>
          {canRunAi && <RunAiButton attemptId={attemptId} itemId={item.id} force label="AI 다시 채점" />}
        </div>
      ) : (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-900">AI 1차 채점이 없습니다. 기준표를 보고 직접 채점할 수 있습니다.</p>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="itemId" value={item.id} />

        {rubric.criteria.map((c) => {
          const aiScore = ai?.criterion_scores[c.key];
          const evidence = (ai?.evidence ?? []).filter((e) => e.criterion === c.key);
          return (
            <fieldset key={c.key} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <legend className="px-1 text-sm font-semibold">
                {c.name}
                {aiScore != null && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">AI {aiScore}점</span>}
                {aiScore != null && scores[c.key] != null && scores[c.key] !== aiScore && (
                  <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">변경</span>
                )}
              </legend>
              {ai?.reasons[c.key] && <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">{ai.reasons[c.key]}</p>}
              {evidence.length > 0 && <EvidenceList items={evidence} />}
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                {c.levels.map((level, i) => {
                  const v = i + 1;
                  const checked = scores[c.key] === v;
                  return (
                    <label
                      key={v}
                      className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-2 text-xs ${checked ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"}`}
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        <input type="radio" name={`score:${c.key}`} value={v} checked={checked} onChange={() => setScores((s) => ({ ...s, [c.key]: v }))} required />
                        {v}점{aiScore === v && <span className="font-normal text-blue-700">(AI)</span>}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-400">{level}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label className="block text-sm">
          <span className="font-medium">
            확정 사유 {differs ? <span className="text-red-600">(AI 점수와 달라 필수)</span> : <span className="text-zinc-500">(선택)</span>}
          </span>
          <textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={differs}
            rows={2}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border border-zinc-300 p-2 dark:border-zinc-700 dark:bg-zinc-950"
            placeholder={differs ? "어느 기준을 왜 바꿨는지 적어 주세요." : ""}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || !complete} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
            {pending ? "저장 중…" : final ? "확정 점수 수정" : "이 점수로 확정"}
          </button>
          <span className="text-sm text-zinc-500">{preview != null ? `문항 점수 ${preview}점` : "모든 기준을 골라 주세요"}</span>
          {state.message && (
            <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`} role={state.ok ? "status" : "alert"}>
              {state.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {items.map((e, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden>{e.verified ? "“" : "⚠"}</span>
          <span className={e.verified ? "text-zinc-700 dark:text-zinc-300" : "text-amber-700"}>
            {e.quote}
            {!e.verified && " — 응답 원문에서 찾을 수 없는 인용입니다"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** AI 가 인용한 구절을 응답 원문에서 표시한다 (원문과 정확히 일치하는 부분만) */
function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges: [number, number][] = [];
  for (const q of quotes) {
    const at = text.indexOf(q);
    if (at >= 0) ranges.push([at, at + q.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    if (e <= pos) return;
    const start = Math.max(s, pos);
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(<mark key={i} className="bg-yellow-100 dark:bg-yellow-900">{text.slice(start, e)}</mark>);
    pos = e;
  });
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
