"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHOICE_ITEMS, ESSAY_ITEMS, LIKERT_LABELS, SELF_ITEMS, type Item } from "@/lib/exam/items";
import type { Answer, ResponseRow } from "@/lib/attempt/types";

// 자기평가를 먼저 받아 객관식 문항을 본 뒤의 인상이 자기평가에 섞이지 않게 한다
const SECTIONS: { name: string; items: Item[] }[] = [
  { name: "자기평가", items: SELF_ITEMS },
  { name: "객관식", items: CHOICE_ITEMS },
  { name: "서술형", items: ESSAY_ITEMS },
];
const ORDER: Item[] = SECTIONS.flatMap((s) => s.items);
const SAVE_DEBOUNCE_MS = 1000;
const SAVE_INTERVAL_MS = 15_000;

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  token: string;
  title: string;
  candidateName: string;
  deadline: number;
  serverNow: number;
  initial: ResponseRow[];
}

function isAnswered(a: Answer | undefined): boolean {
  if (!a) return false;
  return "value" in a ? true : a.text.trim().length > 0;
}

export default function ExamRunner({ token, title, candidateName, deadline, serverNow, initial }: Props) {
  const router = useRouter();
  const api = `/api/t/${encodeURIComponent(token)}`;

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(initial.map((r) => [r.item_id, r.answer])));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - serverNow));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 렌더와 무관하게 바뀌는 값은 ref 로 둔다
  const answersRef = useRef(answers);
  const msRef = useRef<Record<string, number>>(Object.fromEntries(initial.map((r) => [r.item_id, r.response_ms ?? 0])));
  const pastedRef = useRef<Record<string, boolean>>(Object.fromEntries(initial.map((r) => [r.item_id, r.pasted])));
  const dirtyRef = useRef(new Set<string>());
  const enteredAtRef = useRef<number | null>(null);
  const idxRef = useRef(0);
  const skewRef = useRef(0); // 서버 시각 - 브라우저 시각
  const doneRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 문항별 응답 시간 ─────────────────────────────
  const commitTime = useCallback(() => {
    const at = enteredAtRef.current;
    if (at == null) return;
    const id = ORDER[idxRef.current].id;
    const now = performance.now();
    msRef.current[id] = Math.round((msRef.current[id] ?? 0) + (now - at));
    enteredAtRef.current = now;
    if (answersRef.current[id]) dirtyRef.current.add(id);
  }, []);

  const rowsFor = useCallback((ids: Iterable<string>): ResponseRow[] => {
    const rows: ResponseRow[] = [];
    for (const id of ids) {
      const answer = answersRef.current[id];
      if (!answer) continue; // 답하지 않은 문항은 보내지 않는다
      rows.push({ item_id: id, answer, response_ms: msRef.current[id] ?? 0, pasted: pastedRef.current[id] ?? false });
    }
    return rows;
  }, []);

  // ── 임시 저장 ───────────────────────────────────
  const flush = useCallback(
    async (opts: { keepalive?: boolean } = {}) => {
      if (doneRef.current) return;
      commitTime();
      const ids = [...dirtyRef.current];
      const rows = rowsFor(ids);
      if (rows.length === 0) return;
      dirtyRef.current.clear();
      setSaveState("saving");
      try {
        const res = await fetch(`${api}/responses`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses: rows }),
          keepalive: opts.keepalive,
        });
        if (res.status === 409 || res.status === 404) {
          // 시간이 끝났거나 다른 창에서 제출함, 또는 담당자가 재응시를 허용해 응시가 초기화됨 → 서버 상태로 다시 그린다
          doneRef.current = true;
          router.refresh();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        setSaveState("saved");
      } catch {
        ids.forEach((id) => dirtyRef.current.add(id)); // 다음 저장 때 다시 보낸다
        setSaveState("error");
      }
    },
    [api, commitTime, rowsFor, router],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  // ── 제출 ────────────────────────────────────────
  const submit = useCallback(async () => {
    if (doneRef.current) return;
    commitTime();
    doneRef.current = true;
    setSubmitting(true);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const res = await fetch(`${api}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: rowsFor(Object.keys(answersRef.current)) }),
      });
      if (!res.ok && res.status !== 409 && res.status !== 404) throw new Error((await res.json().catch(() => null))?.error ?? "제출하지 못했습니다.");
      router.refresh();
    } catch (e) {
      doneRef.current = false;
      setSubmitting(false);
      setError(`${e instanceof Error ? e.message : "제출하지 못했습니다."} 네트워크를 확인한 뒤 다시 제출해 주세요.`);
    }
  }, [api, commitTime, rowsFor, router]);

  // ── 타이머 ──────────────────────────────────────
  useEffect(() => {
    skewRef.current = serverNow - Date.now();
    const tick = () => {
      const left = Math.max(0, deadline - (Date.now() + skewRef.current));
      setRemaining(left);
      if (left === 0) void submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, serverNow, submit]);

  // ── 주기 저장, 화면 전환, 창 닫기 ───────────────────
  useEffect(() => {
    enteredAtRef.current = performance.now();
    const interval = setInterval(() => dirtyRef.current.size > 0 && void flush(), SAVE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flush({ keepalive: true });
        enteredAtRef.current = null; // 다른 창을 보는 동안은 응답 시간에 넣지 않는다
      } else {
        enteredAtRef.current = performance.now();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!doneRef.current && dirtyRef.current.size > 0) {
        void flush({ keepalive: true });
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  // ── 입력 ────────────────────────────────────────
  function setAnswer(id: string, answer: Answer) {
    const next = { ...answersRef.current, [id]: answer };
    answersRef.current = next;
    setAnswers(next);
    dirtyRef.current.add(id);
    scheduleSave();
  }

  function go(to: number) {
    if (to < 0 || to >= ORDER.length || to === idxRef.current) return;
    commitTime();
    idxRef.current = to;
    setIdx(to);
    if (dirtyRef.current.size > 0) void flush();
    window.scrollTo({ top: 0 });
  }

  const item = ORDER[idx];
  const section = SECTIONS.find((s) => s.items.includes(item))!;
  const answered = ORDER.filter((i) => isAnswered(answers[i.id])).length;
  const unanswered = ORDER.length - answered;
  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  const urgent = remaining < 5 * 60_000;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-zinc-500">
              {candidateName} · {answered}/{ORDER.length} 응답 · <SaveBadge state={saveState} />
            </p>
          </div>
          <div
            className={`rounded-lg px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${urgent ? "bg-red-50 text-red-600 dark:bg-red-950" : "bg-zinc-100 dark:bg-zinc-900"}`}
            aria-label="남은 시간"
          >
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-3xl flex-1 gap-6 px-4 py-6 md:grid-cols-[1fr_12rem]">
        <section className="min-w-0">
          <p className="text-sm text-zinc-500">
            {section.name} · {idx + 1} / {ORDER.length}
          </p>
          <ItemView item={item} answer={answers[item.id]} onAnswer={(a) => setAnswer(item.id, a)} onPaste={() => {
            pastedRef.current[item.id] = true;
            dirtyRef.current.add(item.id);
          }} />

          <div className="mt-8 flex items-center gap-2">
            <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0} className="rounded-lg border border-zinc-300 px-4 py-2 disabled:opacity-30 dark:border-zinc-700">
              이전
            </button>
            {idx < ORDER.length - 1 ? (
              <button type="button" onClick={() => go(idx + 1)} className="ml-auto rounded-lg bg-zinc-900 px-5 py-2 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                다음
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">
                제출하기
              </button>
            )}
          </div>
        </section>

        <nav aria-label="문항 이동" className="space-y-4 md:sticky md:top-20 md:self-start">
          {SECTIONS.map((s) => (
            <div key={s.name}>
              <p className="mb-1.5 text-xs font-medium text-zinc-500">{s.name}</p>
              <div className="grid grid-cols-8 gap-1 md:grid-cols-5">
                {s.items.map((it) => {
                  const n = ORDER.indexOf(it);
                  const done = isAnswered(answers[it.id]);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => go(n)}
                      aria-current={n === idx ? "step" : undefined}
                      aria-label={`${n + 1}번 ${done ? "응답함" : "미응답"}`}
                      className={`h-8 rounded text-xs tabular-nums ${n === idx ? "ring-2 ring-blue-500" : ""} ${done ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                    >
                      {n + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setConfirming(true)} className="w-full rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600">
            제출하기
          </button>
        </nav>
      </main>

      {(confirming || submitting) && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
            <h2 id="submit-title" className="text-lg font-bold">
              {remaining === 0 ? "시간이 끝나 제출하는 중입니다" : "답안을 제출할까요?"}
            </h2>
            {unanswered > 0 && remaining > 0 && (
              <p className="text-sm text-red-600">
                아직 답하지 않은 문항이 {unanswered}개 있습니다. 미응답 객관식은 오답으로 처리됩니다.
              </p>
            )}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">제출한 뒤에는 답을 고칠 수 없습니다.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="flex-1 rounded-lg border border-zinc-300 py-2 disabled:opacity-40 dark:border-zinc-700">
                계속 풀기
              </button>
              <button type="button" onClick={() => void submit()} disabled={submitting} className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white disabled:opacity-60">
                {submitting ? "제출 중…" : "제출"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <span>저장 중…</span>;
  if (state === "saved") return <span>자동 저장됨</span>;
  if (state === "error") return <span className="text-red-600">저장 실패 · 다시 시도합니다</span>;
  return <span>자동 저장</span>;
}

function ItemView({ item, answer, onAnswer, onPaste }: { item: Item; answer: Answer | undefined; onAnswer: (a: Answer) => void; onPaste: () => void }) {
  const value = answer && "value" in answer ? answer.value : null;

  if (item.type === "essay") {
    const text = answer && "text" in answer ? answer.text : "";
    const len = text.trim().length;
    return (
      <div className="mt-2 space-y-4">
        <h2 className="text-xl font-bold">{item.title}</h2>
        <div className="whitespace-pre-line rounded-lg bg-zinc-50 p-4 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{item.scenario}</div>
        <p className="font-medium">{item.prompt}</p>
        <textarea
          value={text}
          onChange={(e) => onAnswer({ text: e.target.value })}
          onPaste={onPaste}
          maxLength={4000}
          rows={12}
          className="w-full rounded-lg border border-zinc-300 p-3 leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
          placeholder="여기에 답안을 작성하세요."
        />
        <p className={`text-right text-sm ${len < item.minLength ? "text-amber-600" : "text-zinc-500"}`}>
          {len}자 (최소 {item.minLength}자 권장)
        </p>
      </div>
    );
  }

  const options = item.type === "choice" ? item.options : LIKERT_LABELS;
  return (
    <fieldset className="mt-2">
      <legend className="text-lg font-semibold leading-relaxed">{item.prompt}</legend>
      <div className={`mt-4 ${item.type === "self" ? "grid gap-2 sm:grid-cols-5" : "space-y-2"}`}>
        {options.map((label, i) => {
          const v = i + 1;
          const checked = value === v;
          return (
            <label
              key={v}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"} ${item.type === "self" ? "sm:flex-col sm:items-center sm:text-center" : ""}`}
            >
              <input type="radio" name={item.id} value={v} checked={checked} onChange={() => onAnswer({ value: v })} className="mt-1 size-4 shrink-0" />
              <span>
                {item.type === "choice" && <span className="mr-1 font-semibold">{v}.</span>}
                {label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
