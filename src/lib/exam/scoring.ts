// 채점 엔진 (순수 함수). 정답 키는 호출하는 쪽(서버)에서 넘겨준다.

import {
  CHAPTERS, MID_FACTORS, TOP_FACTORS,
  type ChapterId, type MidFactorId, type TopFactorId,
} from "./factors";
import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "./items";
import type { Rubric } from "./answer-key.data";

// ── 등급 (8단계, 하한 포함) ─────────────────────────────
export type Grade = "D" | "D+" | "C" | "C+" | "B" | "B+" | "A" | "A+";

export const GRADE_BANDS: { grade: Grade; min: number }[] = [
  { grade: "A+", min: 90 }, { grade: "A", min: 80 }, { grade: "B+", min: 70 }, { grade: "B", min: 60 },
  { grade: "C+", min: 50 }, { grade: "C", min: 40 }, { grade: "D+", min: 30 }, { grade: "D", min: 0 },
];

export function gradeOf(score: number): Grade {
  return (GRADE_BANDS.find((b) => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1]).grade;
}

// ── 신입 AI 유형 (지식 × 실전, 3×3) ──────────────────────
export type Band = "low" | "mid" | "high";
export const TYPE_THRESHOLDS = { mid: 50, high: 75 };

export function bandOf(score: number): Band {
  if (score >= TYPE_THRESHOLDS.high) return "high";
  if (score >= TYPE_THRESHOLDS.mid) return "mid";
  return "low";
}

export interface AiType {
  id: string;
  name: string;
  desc: string;
  growth: string;
}

// [실전 band][지식 band]
export const AI_TYPES: Record<Band, Record<Band, AiType>> = {
  high: {
    low: { id: "intuitive", name: "직관형 활용가", desc: "원리 지식은 부족하지만 실제 상황에서는 AI를 잘 다룹니다.", growth: "AI 원리와 한계를 익혀 직관에 근거를 더하세요." },
    mid: { id: "practical", name: "실전 성장가", desc: "실전 감각이 좋고 기본 지식도 갖췄습니다.", growth: "도구와 기법의 원리를 깊게 익히면 에이스로 성장할 수 있습니다." },
    high: { id: "ace", name: "AI 에이스", desc: "지식과 실전 모두 뛰어나 바로 업무에 AI를 적용할 수 있습니다.", growth: "동기와 팀에 AI 활용법을 전파하는 역할을 맡아 보세요." },
  },
  mid: {
    low: { id: "experiential", name: "경험 학습가", desc: "써 보면서 익히는 유형으로, 지식 보완이 필요합니다.", growth: "교재 Part 1~2로 원리를 정리하면 실전 점수도 함께 오릅니다." },
    mid: { id: "balanced", name: "균형 성장형", desc: "지식과 실전이 고르게 기본 수준을 갖췄습니다.", growth: "약점 요인 한 가지를 정해 집중적으로 연습하세요." },
    high: { id: "knowledge", name: "지식 탄탄형", desc: "원리 이해는 뛰어나지만 실전 적용은 더 연습이 필요합니다.", growth: "실제 업무 한 가지에 AI를 적용하며 프롬프트를 다듬어 보세요." },
  },
  low: {
    low: { id: "beginner", name: "AI 입문자", desc: "AI 활용을 이제 시작하는 단계입니다.", growth: "교재를 처음부터 차근차근 따라가며 매일 조금씩 써 보세요." },
    mid: { id: "foundation", name: "기초 학습자", desc: "기본 개념은 알지만 실제로 써 본 경험이 부족합니다.", growth: "5요소 프롬프트로 간단한 업무부터 직접 시도해 보세요." },
    high: { id: "theory", name: "이론 우선형", desc: "지식은 충분하지만 실전에서 활용하지 못하고 있습니다.", growth: "배운 원리를 실제 시나리오에 적용하는 연습이 가장 효과적입니다." },
  },
};

export function aiTypeOf(knowledge: number, practice: number): AiType {
  return AI_TYPES[bandOf(practice)][bandOf(knowledge)];
}

// ── 서술형 점수 ─────────────────────────────────────────
/** 기준별 점수(1~4) → 0~100 */
export function essayScoreFromCriteria(rubric: Rubric, scores: Record<string, number>): number {
  const n = rubric.criteria.length;
  let sum = 0;
  for (const c of rubric.criteria) {
    const v = scores[c.key];
    if (!Number.isInteger(v) || v < 1 || v > 4) throw new Error(`invalid score for ${rubric.itemId}.${c.key}: ${v}`);
    sum += v;
  }
  return round1(((sum - n) / (n * 3)) * 100);
}

// ── 종합 채점 ───────────────────────────────────────────
export const WEIGHTS = { choice: 0.4, essay: 0.6 };
export const GAP_THRESHOLD = 30;
export const REVIEW_BELOW = 60;

export interface AttemptAnswers {
  choice: Record<string, number | null | undefined>; // 보기 번호 1~4
  self: Record<string, number | null | undefined>; // 1~5
  essay: Record<string, number | null | undefined>; // 담당자 확정 점수 0~100, 미확정이면 null
}

export interface MidResult {
  id: MidFactorId;
  name: string;
  top: TopFactorId;
  choiceScore: number;
  essayScore: number | null;
  score: number | null; // 서술형이 걸린 요인은 확정 전까지 null
  selfScore: number | null;
  gap: number | null; // 자기평가 - 실제
  gapNote: "over" | "under" | null;
  wrongItems: string[];
}

export interface TopResult {
  id: TopFactorId;
  name: string;
  score: number | null;
  grade: Grade | null;
}

export interface ReviewChapter {
  id: ChapterId;
  title: string;
}

export interface ExamResult {
  status: "complete" | "grading";
  knowledge: number;
  practice: number | null;
  total: number | null;
  grade: Grade | null;
  aiType: AiType | null;
  tops: TopResult[];
  mids: MidResult[];
  strengths: string[]; // 중위요인 이름, 상위 2개
  weaknesses: string[]; // 중위요인 이름, 하위 2개
  review: ReviewChapter[];
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function scoreAttempt(answers: AttemptAnswers, answerKey: Record<string, number>): ExamResult {
  const correct = (id: string) => answers.choice[id] != null && answers.choice[id] === answerKey[id];
  const choiceRatio = (ids: string[]) => (ids.filter(correct).length / ids.length) * 100;

  const knowledge = round1(choiceRatio(CHOICE_ITEMS.map((i) => i.id)));

  const essayScores = ESSAY_ITEMS.map((e) => answers.essay[e.id]);
  const essaysDone = essayScores.every((s) => s != null);
  const practice = essaysDone ? round1(mean(essayScores as number[])) : null;

  const mids: MidResult[] = MID_FACTORS.map((m) => {
    const items = CHOICE_ITEMS.filter((i) => i.mid === m.id);
    const choiceScore = round1(choiceRatio(items.map((i) => i.id)));
    const essay = ESSAY_ITEMS.find((e) => e.mid === m.id);
    const essayScore = essay ? (answers.essay[essay.id] ?? null) : null;
    const score = essay ? (essayScore == null ? null : round1((choiceScore + essayScore) / 2)) : choiceScore;

    const selfItem = SELF_ITEMS.find((s) => s.mid === m.id);
    const selfRaw = selfItem ? answers.self[selfItem.id] : null;
    const selfScore = selfRaw == null ? null : round1(((selfRaw - 1) / 4) * 100);
    const gap = selfScore == null || score == null ? null : round1(selfScore - score);
    const gapNote = gap == null ? null : gap >= GAP_THRESHOLD ? "over" : gap <= -GAP_THRESHOLD ? "under" : null;

    return {
      id: m.id, name: m.name, top: m.top, choiceScore, essayScore, score, selfScore, gap, gapNote,
      wrongItems: items.filter((i) => !correct(i.id)).map((i) => i.id),
    };
  });

  const topScore = (id: TopFactorId): number | null => {
    const ids = CHOICE_ITEMS.filter((i) => MID_FACTORS.find((m) => m.id === i.mid)!.top === id).map((i) => i.id);
    const c = choiceRatio(ids);
    const essays = ESSAY_ITEMS.filter((e) => MID_FACTORS.find((m) => m.id === e.mid)!.top === id);
    if (essays.length === 0) return round1(c);
    const es = essays.map((e) => answers.essay[e.id]);
    if (es.some((s) => s == null)) return null;
    return round1(c * WEIGHTS.choice + mean(es as number[]) * WEIGHTS.essay);
  };

  const tops: TopResult[] = TOP_FACTORS.map((t) => {
    const score = topScore(t.id);
    return { id: t.id, name: t.name, score, grade: score == null ? null : gradeOf(score) };
  });

  const complete = essaysDone;
  const total = complete ? round1(mean(tops.map((t) => t.score as number))) : null;

  // 강점·약점: 점수가 확정된 중위요인 기준, 동점이면 요인 순서
  const scored = mids.filter((m) => m.score != null);
  const sorted = [...scored].sort((a, b) => (b.score as number) - (a.score as number));
  const flat = sorted.length > 0 && sorted[0].score === sorted[sorted.length - 1].score;
  const strengths = complete && !flat ? sorted.slice(0, 2).map((m) => m.name) : [];
  const weaknesses = complete && !flat ? sorted.slice(-2).reverse().map((m) => m.name) : [];

  // 복습할 장: 점수가 낮거나 객관식 오답이 있는 요인의 출처 장 (교재 순서)
  const weakChapters = new Set<ChapterId>();
  for (const m of mids) {
    const low = m.score != null ? m.score < REVIEW_BELOW : m.choiceScore < REVIEW_BELOW;
    if (low) MID_FACTORS.find((x) => x.id === m.id)!.chapters.forEach((c) => weakChapters.add(c));
    for (const id of m.wrongItems) weakChapters.add(CHOICE_ITEMS.find((i) => i.id === id)!.chapter);
  }
  const review = (Object.keys(CHAPTERS) as ChapterId[])
    .filter((c) => weakChapters.has(c))
    .map((c) => ({ id: c, title: CHAPTERS[c].title }));

  return {
    status: complete ? "complete" : "grading",
    knowledge,
    practice,
    total,
    grade: total == null ? null : gradeOf(total),
    aiType: complete ? aiTypeOf(knowledge, practice as number) : null,
    tops, mids, strengths, weaknesses, review,
  };
}

// ── 동기 내 위치 ────────────────────────────────────────
/** "상위 N%" 의 N. 나보다 높은 사람 수 기준이며 최소 1. */
export function topPercent(mine: number, cohort: number[]): number {
  if (cohort.length === 0) return 100;
  const higher = cohort.filter((s) => s > mine).length;
  return Math.max(1, Math.ceil(((higher + 1) / cohort.length) * 100));
}
