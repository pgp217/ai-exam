// 응답 신뢰도 신호 (에이치닷 "자기 응답 신뢰도"에 대응). 순수 함수.
// 신호는 판정이 아니라 담당자가 답안을 보고 판단할 "추가 검토" 대상을 알려 주는 용도다.
// 신호가 하나라도 있으면 caution(추가 검토 필요), 없으면 reliable. 예전 판정의 unreliable 은 caution 과 같이 다룬다.

import type { ItemSet } from "./items";

export const RELIABILITY_RULES = {
  minAvgChoiceMs: 5000, // 객관식 평균 응답 시간 하한
  maxFastAccuracy: 0.5, // 빠르게 풀었더라도 정답률이 이 값 이상이면 아는 문제를 빨리 푼 것으로 본다
  maxStraightRun: 8, // 같은 보기 번호 연속 선택 허용 한계 (이 값 이상이면 신호)
  minEssayLength: 50, // 서술형 최소 글자 수 (1자 이상 쓴 답안에만 적용. 빈 답안은 미응답으로 따로 표시)
};

export type SignalId = "too-fast" | "straight-line" | "flat-self" | "essay-paste" | "essay-short";

export const SIGNAL_LABELS: Record<SignalId, string> = {
  "too-fast": "객관식을 매우 빠르게 풀었고 정답률도 낮음",
  "straight-line": "같은 보기 번호를 연속으로 선택",
  "flat-self": "자기평가 문항을 모두 같은 값으로 응답",
  "essay-paste": "서술형에 붙여넣기 있음 (지문 인용일 수 있음)",
  "essay-short": "작성한 서술형 답안의 분량이 매우 짧음",
};

export interface ReliabilityInput {
  choice: Record<string, number | null | undefined>;
  choiceMs: Record<string, number | null | undefined>;
  self: Record<string, number | null | undefined>;
  essayText: Record<string, string | null | undefined>;
  essayPasted: Record<string, boolean | null | undefined>;
}

export type ReliabilityLevel = "reliable" | "caution" | "unreliable";

export const RELIABILITY_LABELS: Record<ReliabilityLevel, string> = {
  reliable: "특이사항 없음",
  caution: "추가 검토 필요",
  unreliable: "추가 검토 필요", // 예전 판정. 새로 만들지 않는다
};

/** 화면 필터에 쓰는 선택지 (unreliable 은 caution 에 포함) */
export const RELIABILITY_FILTER_OPTIONS: [ReliabilityLevel, string][] = [
  ["reliable", RELIABILITY_LABELS.reliable],
  ["caution", RELIABILITY_LABELS.caution],
];

/** 예전 판정(unreliable)을 지금 기준(caution)으로 맞춘다 */
export function normalizeLevel(level: ReliabilityLevel): ReliabilityLevel {
  return level === "unreliable" ? "caution" : level;
}

export interface ReliabilityResult {
  level: ReliabilityLevel;
  signals: SignalId[];
}

export function longestStraightRun(values: (number | null | undefined)[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const v of values) {
    if (v == null) {
      run = 0;
      prev = null;
      continue;
    }
    run = v === prev ? run + 1 : 1;
    prev = v;
    best = Math.max(best, run);
  }
  return best;
}

export function assessReliability(input: ReliabilityInput, set: ItemSet, answerKey: Record<string, number>): ReliabilityResult {
  const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = set;
  const signals: SignalId[] = [];

  // 빠른 응답만으로는 판단하지 않는다. 정답률이 낮을 때만 신호
  const times = CHOICE_ITEMS.map((i) => input.choiceMs[i.id]).filter((t): t is number => t != null);
  const accuracy = CHOICE_ITEMS.filter((i) => input.choice[i.id] != null && input.choice[i.id] === answerKey[i.id]).length / CHOICE_ITEMS.length;
  if (
    times.length > 0 &&
    times.reduce((s, t) => s + t, 0) / times.length < RELIABILITY_RULES.minAvgChoiceMs &&
    accuracy < RELIABILITY_RULES.maxFastAccuracy
  ) {
    signals.push("too-fast");
  }

  if (longestStraightRun(CHOICE_ITEMS.map((i) => input.choice[i.id])) >= RELIABILITY_RULES.maxStraightRun) {
    signals.push("straight-line");
  }

  const selfVals = SELF_ITEMS.map((i) => input.self[i.id]);
  if (selfVals.every((v) => v != null) && new Set(selfVals).size === 1) signals.push("flat-self");

  if (ESSAY_ITEMS.some((e) => input.essayPasted[e.id])) signals.push("essay-paste");

  if (ESSAY_ITEMS.some((e) => {
    const len = (input.essayText[e.id] ?? "").trim().length;
    return len > 0 && len < RELIABILITY_RULES.minEssayLength;
  })) {
    signals.push("essay-short");
  }

  const level: ReliabilityLevel = signals.length === 0 ? "reliable" : "caution";
  return { level, signals };
}
