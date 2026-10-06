// 응답 신뢰도 판정 (에이치닷 "자기 응답 신뢰도"에 대응). 순수 함수.

import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "./items";

export const RELIABILITY_RULES = {
  minAvgChoiceMs: 5000, // 객관식 평균 응답 시간 하한
  maxStraightRun: 8, // 같은 보기 번호 연속 선택 허용 한계 (이 값 이상이면 신호)
  minEssayLength: 50, // 서술형 최소 글자 수
};

export type SignalId = "too-fast" | "straight-line" | "flat-self" | "essay-paste" | "essay-short";

export const SIGNAL_LABELS: Record<SignalId, string> = {
  "too-fast": "객관식 응답 시간이 지나치게 짧음",
  "straight-line": "같은 보기 번호를 연속으로 선택",
  "flat-self": "자기평가 문항을 모두 같은 값으로 응답",
  "essay-paste": "서술형 입력 중 붙여넣기 발생",
  "essay-short": "서술형 답안 분량 부족",
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
  reliable: "신뢰 가능",
  caution: "주의",
  unreliable: "신뢰 불가",
};

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

export function assessReliability(input: ReliabilityInput): ReliabilityResult {
  const signals: SignalId[] = [];

  const times = CHOICE_ITEMS.map((i) => input.choiceMs[i.id]).filter((t): t is number => t != null);
  if (times.length > 0 && times.reduce((s, t) => s + t, 0) / times.length < RELIABILITY_RULES.minAvgChoiceMs) {
    signals.push("too-fast");
  }

  if (longestStraightRun(CHOICE_ITEMS.map((i) => input.choice[i.id])) >= RELIABILITY_RULES.maxStraightRun) {
    signals.push("straight-line");
  }

  const selfVals = SELF_ITEMS.map((i) => input.self[i.id]);
  if (selfVals.every((v) => v != null) && new Set(selfVals).size === 1) signals.push("flat-self");

  if (ESSAY_ITEMS.some((e) => input.essayPasted[e.id])) signals.push("essay-paste");

  if (ESSAY_ITEMS.some((e) => (input.essayText[e.id] ?? "").trim().length < RELIABILITY_RULES.minEssayLength)) {
    signals.push("essay-short");
  }

  const level: ReliabilityLevel = signals.length === 0 ? "reliable" : signals.length === 1 ? "caution" : "unreliable";
  return { level, signals };
}
