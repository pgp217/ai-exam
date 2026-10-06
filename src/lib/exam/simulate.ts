// 가상 응시자 생성 (결정적 난수). 동기 분포·상위 % 를 보여 줄 비교 집단이 필요할 때 쓴다.
// 실제 응시자와 구분되도록 이름에 "가상" 을 붙이고, 서술형 답안은 만들지 않고 확정 점수만 만든다.

import type { ResponseRow } from "../attempt/types";
import { ESSAY_ITEMS, CHOICE_ITEMS, SELF_ITEMS } from "./items";
import type { Rubric } from "./answer-key.data";
import { essayScoreFromCriteria } from "./scoring";

/** mulberry32: 시드가 같으면 항상 같은 수열 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number, mean: number, sd: number) {
  const u = Math.max(r(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const DEPARTMENTS = ["경영지원팀", "영업1팀", "영업2팀", "마케팅팀", "개발팀", "인사팀"];

export interface SimulatedCandidate {
  name: string;
  employee_no: string;
  department: string;
  responses: ResponseRow[]; // 자기평가·객관식 (서술형은 빈 답안)
  essayCriteria: Record<string, Record<string, number>>; // 문항 → 기준별 확정 점수
  essayScores: Record<string, number>;
  durationSec: number;
}

/** 능력치(0~1)에 따라 객관식 정답 확률, 서술형 기준 점수, 자기평가를 만든다 */
export function simulateCohort(n: number, answerKey: Record<string, number>, rubrics: Rubric[], seed = 2026): SimulatedCandidate[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const knowledge = clamp(normal(r, 0.66, 0.16), 0.15, 0.98);
    const practice = clamp(knowledge + normal(r, -0.05, 0.18), 0.05, 0.98);
    const selfBias = normal(r, 0.05, 0.15); // 대체로 자신을 조금 높게 본다

    const choice: ResponseRow[] = CHOICE_ITEMS.map((item) => {
      const correct = r() < knowledge;
      const key = answerKey[item.id];
      const wrong = ((key + Math.floor(r() * 3)) % 4) + 1; // key 를 제외한 세 보기 중 하나
      return { item_id: item.id, answer: { value: correct ? key : wrong }, response_ms: Math.round(6000 + r() * 30000), pasted: false };
    });
    const self: ResponseRow[] = SELF_ITEMS.map((item) => ({
      item_id: item.id,
      answer: { value: clamp(Math.round(1 + 4 * clamp(knowledge + selfBias + normal(r, 0, 0.12), 0, 1)), 1, 5) },
      response_ms: Math.round(3000 + r() * 8000),
      pasted: false,
    }));
    const essays: ResponseRow[] = ESSAY_ITEMS.map((item) => ({ item_id: item.id, answer: { text: "" }, response_ms: null, pasted: false }));

    const essayCriteria: Record<string, Record<string, number>> = {};
    const essayScores: Record<string, number> = {};
    for (const rubric of rubrics) {
      essayCriteria[rubric.itemId] = Object.fromEntries(
        rubric.criteria.map((c) => [c.key, clamp(Math.round(1 + 3 * clamp(practice + normal(r, 0, 0.18), 0, 1)), 1, 4)]),
      );
      essayScores[rubric.itemId] = essayScoreFromCriteria(rubric, essayCriteria[rubric.itemId]);
    }

    return {
      name: `가상응시자 ${String(i + 1).padStart(2, "0")}`,
      employee_no: `SIM-${String(i + 1).padStart(3, "0")}`,
      department: DEPARTMENTS[Math.floor(r() * DEPARTMENTS.length)],
      responses: [...self, ...choice, ...essays],
      essayCriteria,
      essayScores,
      durationSec: Math.round(1200 + r() * 1100),
    };
  });
}
