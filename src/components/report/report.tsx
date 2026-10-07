// 개인 결과 리포트. 응시자 화면(/t/[token])과 관리자 화면에서 함께 쓴다 (서버 컴포넌트).

import { AI_TYPES, TYPE_THRESHOLDS, type Band, type ExamResult } from "@/lib/exam/scoring";
import { BOOK_CREDIT, CHAPTERS, type ChapterId } from "@/lib/exam/factors";
import { BIN_WIDTH, MIN_COHORT, type CohortView, type Histogram } from "@/lib/report/build";
import type { Feedback } from "@/lib/attempt/types";

interface Props {
  result: ExamResult;
  cohort: CohortView | null;
  /** 응시자에게는 승인된 피드백만 넘긴다 */
  feedback: Feedback | null;
  feedbackPending?: boolean;
}

export default function Report({ result, cohort, feedback, feedbackPending }: Props) {
  return (
    <div className="space-y-6">
      <Overall result={result} cohort={cohort} />
      <TypeGrid result={result} />
      <Keywords result={result} />
      <TopFactors result={result} cohort={cohort} />
      <SelfVsActual result={result} />
      <FeedbackSection feedback={feedback} pending={feedbackPending} />
      <Review result={result} />
    </div>
  );
}

function Section({ n, title, children, note }: { n: number; title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800" aria-labelledby={`report-${n}`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 id={`report-${n}`} className="text-lg font-bold">
          <span className="mr-1.5 text-zinc-400">{n}</span>
          {title}
        </h2>
        {note && <p className="text-xs text-zinc-500">{note}</p>}
      </div>
      {children}
    </section>
  );
}

// ── 1. 종합 결과 ─────────────────────────────────────
function Overall({ result, cohort }: { result: ExamResult; cohort: CohortView | null }) {
  return (
    <Section n={1} title="종합 결과">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-xl bg-zinc-50 px-5 py-4 dark:bg-zinc-900">
          <div className="text-center">
            <p className="text-xs text-zinc-500">종합 등급</p>
            <p className="text-5xl font-bold leading-tight">{result.grade}</p>
          </div>
          <div>
            <p className="text-3xl font-semibold tabular-nums">{result.total}<span className="text-base font-normal text-zinc-500">점</span></p>
            {cohort ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">동기 {cohort.size}명 중 <strong className="text-zinc-900 dark:text-zinc-100">상위 {cohort.topPercent}%</strong></p>
            ) : (
              <p className="text-xs text-zinc-500">동기가 {MIN_COHORT}명 이상 확정되면 상위 %를 보여 드립니다.</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="지식 점수" value={result.knowledge} note="객관식 24문항 정답률" />
          <Stat label="실전 점수" value={result.practice} note="서술형 3문항 확정 점수 평균" />
          {cohort && (
            <div className="col-span-2">
              <Histo hist={cohort.total} label="종합 점수 동기 분포" />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function Stat({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value ?? "—"}<span className="text-sm font-normal text-zinc-500">점</span></p>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  );
}

/** 점수 분포 히스토그램: 회색 막대가 동기 분포, 파란 막대가 내 점수가 속한 구간 */
function Histo({ hist, label }: { hist: Histogram; label: string }) {
  const max = Math.max(...hist.bins, 1);
  const total = hist.bins.reduce((s, x) => s + x, 0);
  return (
    <figure>
      <figcaption className="mb-1 flex items-center gap-3 text-xs text-zinc-500">
        <span>{label}</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--viz-actual)" }} />내 위치</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--viz-muted)" }} />동기</span>
      </figcaption>
      <div className="flex h-16 items-end gap-0.5" role="img" aria-label={`${label}: ${hist.bins.map((c, i) => `${i * BIN_WIDTH}~${(i + 1) * BIN_WIDTH}점 ${c}명`).join(", ")}. 내 점수는 ${hist.mine * BIN_WIDTH}~${(hist.mine + 1) * BIN_WIDTH}점 구간`}>
        {hist.bins.map((c, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" title={`${i * BIN_WIDTH}~${(i + 1) * BIN_WIDTH}점: ${c}명 (${Math.round((c / total) * 100)}%)${i === hist.mine ? " · 내 위치" : ""}`}>
            <div
              className="w-full rounded-t"
              style={{ height: c === 0 ? 2 : `${(c / max) * 100}%`, background: i === hist.mine ? "var(--viz-actual)" : c === 0 ? "var(--viz-track)" : "var(--viz-muted)" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-zinc-400">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </figure>
  );
}

// ── 2. AI 유형 ───────────────────────────────────────
const BANDS: Band[] = ["low", "mid", "high"];
const BAND_LABELS: Record<Band, string> = { low: "낮음", mid: "보통", high: "높음" };

function TypeGrid({ result }: { result: ExamResult }) {
  if (!result.aiType || result.practice == null) return null;
  const mine = result.aiType.id;
  return (
    <Section n={2} title="신입 AI 유형" note={`가로 지식 점수 · 세로 실전 점수 (낮음 <${TYPE_THRESHOLDS.mid} · 보통 <${TYPE_THRESHOLDS.high} · 높음)`}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1 text-xs">
          {[...BANDS].reverse().map((p) => (
            <Row key={p} label={BAND_LABELS[p]}>
              {BANDS.map((k) => {
                const t = AI_TYPES[p][k];
                const on = t.id === mine;
                return (
                  <div
                    key={k}
                    className={`flex min-h-14 items-center justify-center rounded-lg border p-1.5 text-center leading-snug ${on ? "font-semibold text-white" : "border-zinc-200 text-zinc-500 dark:border-zinc-800"}`}
                    style={on ? { background: "var(--viz-actual)", borderColor: "var(--viz-actual)" } : undefined}
                    aria-current={on ? "true" : undefined}
                  >
                    {t.name}
                  </div>
                );
              })}
            </Row>
          ))}
          <span />
          {BANDS.map((k) => <span key={k} className="pt-1 text-center text-zinc-500">{BAND_LABELS[k]}</span>)}
        </div>
        <div>
          <p className="text-sm text-zinc-500">나의 유형</p>
          <p className="text-2xl font-bold">{result.aiType.name}</p>
          <p className="mt-2 text-zinc-700 dark:text-zinc-300">{result.aiType.desc}</p>
          <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900"><strong>성장 방향</strong> · {result.aiType.growth}</p>
        </div>
      </div>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center pr-1 text-zinc-500">{label}</span>
      {children}
    </>
  );
}

// ── 3. 핵심 키워드 ────────────────────────────────────
function Keywords({ result }: { result: ExamResult }) {
  if (result.strengths.length === 0 && result.weaknesses.length === 0) return null;
  return (
    <Section n={3} title="핵심 키워드">
      <div className="grid gap-3 sm:grid-cols-2">
        <KeywordBox title="강점" icon="▲" items={result.strengths} />
        <KeywordBox title="보완할 점" icon="▼" items={result.weaknesses} />
      </div>
    </Section>
  );
}

function KeywordBox({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <p className="text-sm font-semibold"><span aria-hidden className="mr-1 text-zinc-400">{icon}</span>{title}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((s) => <li key={s} className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950">{s}</li>)}
      </ul>
    </div>
  );
}

// ── 4. 상위요인 결과 ──────────────────────────────────
function TopFactors({ result, cohort }: { result: ExamResult; cohort: CohortView | null }) {
  return (
    <Section n={4} title="역량별 결과" note={cohort ? `동기 ${cohort.size}명 기준 분포` : undefined}>
      <div className="grid gap-4 md:grid-cols-3">
        {result.tops.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500">{t.name}</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums">
              {t.score ?? "—"}<span className="text-sm font-normal text-zinc-500">점</span>
              {t.grade && <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 align-middle text-sm font-semibold dark:bg-zinc-800">{t.grade}</span>}
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
              {result.mids.filter((m) => m.top === t.id).map((m) => <li key={m.id}>{m.name} {m.score ?? "—"}점</li>)}
            </ul>
            {cohort?.tops[t.id] && <div className="mt-3"><Histo hist={cohort.tops[t.id]} label="분포" /></div>}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── 5. 내가 본 나 vs 실제 ─────────────────────────────
function SelfVsActual({ result }: { result: ExamResult }) {
  return (
    <Section n={5} title="내가 본 나 vs 실제" note="자기평가(1~5점)를 0~100으로 바꿔 실제 점수와 비교합니다. 30점 이상 차이 나면 표시합니다.">
      <div className="mb-3 flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--viz-self)" }} />자기평가</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: "var(--viz-actual)" }} />실제</span>
      </div>
      <div className="space-y-3">
        {result.mids.map((m) => (
          <div key={m.id} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-x-3 gap-y-0.5 text-sm">
            <span className="row-span-2 text-zinc-700 dark:text-zinc-300">{m.name}</span>
            <Bar value={m.selfScore} color="var(--viz-self)" label="자기평가" />
            <span className="row-span-2 text-xs">
              {m.gapNote === "over" && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">↑ 과대평가</span>}
              {m.gapNote === "under" && <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">↓ 과소평가</span>}
            </span>
            <Bar value={m.score} color="var(--viz-actual)" label="실제" />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Bar({ value, color, label }: { value: number | null; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label} ${value ?? "—"}점`}>
      <div className="h-2.5 flex-1 rounded-full" style={{ background: "var(--viz-track)" }}>
        {value != null && <div className="h-full rounded-full" style={{ width: `${Math.max(value, 1.5)}%`, background: color }} />}
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-zinc-500"><span className="sr-only">{label} </span>{value ?? "—"}</span>
    </div>
  );
}

// ── 6. AI 피드백 ─────────────────────────────────────
function FeedbackSection({ feedback, pending }: { feedback: Feedback | null; pending?: boolean }) {
  return (
    <Section n={6} title="성장 피드백" note={feedback ? "AI가 초안을 쓰고 담당자가 확인했습니다." : undefined}>
      {feedback ? (
        <div className="space-y-4">
          <p className="leading-relaxed text-zinc-800 dark:text-zinc-200">{feedback.summary}</p>
          <ol className="grid gap-3 md:grid-cols-3">
            {feedback.actions.map((a, i) => (
              <li key={i} className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                <p className="font-semibold"><span className="mr-1 text-zinc-400">{i + 1}.</span>{a.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{a.detail}</p>
                {a.chapter && a.chapter in CHAPTERS && (
                  <p className="mt-2 text-sm text-zinc-500">교재 · {CHAPTERS[a.chapter as ChapterId].title}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{pending ? "담당자가 피드백을 확인하고 있습니다. 확인이 끝나면 이곳에 표시됩니다." : "아직 피드백이 없습니다."}</p>
      )}
    </Section>
  );
}

// ── 7. 복습할 장 ─────────────────────────────────────
function Review({ result }: { result: ExamResult }) {
  return (
    <Section n={7} title="복습할 장" note="틀린 객관식이나 점수가 낮은 역량과 연결된 교재 장입니다.">
      {result.review.length === 0 ? (
        <p className="text-sm text-zinc-500">모든 영역을 잘 해냈습니다. 관심 있는 장을 골라 더 깊이 읽어 보세요.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {result.review.map((c) => (
            <li key={c.id} className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              {c.title}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-zinc-400">{BOOK_CREDIT}</p>
    </Section>
  );
}
