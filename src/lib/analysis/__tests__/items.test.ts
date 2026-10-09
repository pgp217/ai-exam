import { describe, expect, it } from "vitest";
import { scoreSubmission } from "../../attempt/responses";
import type { ResponseRow } from "../../attempt/types";
import { analyzeItems, type AnalysisAttempt } from "../items";
import { itemSet } from "../../exam/items";
import { rubricFor as rubricOf, scoringKey } from "../../exam/answer-key.data";

// 기존 테스트는 문항 세트 v1 기준으로 검증한다
const SET = itemSet("NEWHIRE-AI-v1");
const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = SET;
const { answerKey: ANSWER_KEY, rubrics: RUBRICS } = scoringKey("NEWHIRE-AI-v1");
const rubricFor = (id: string) => rubricOf(scoringKey("NEWHIRE-AI-v1"), id);
void CHOICE_ITEMS; void SELF_ITEMS; void ESSAY_ITEMS; void RUBRICS; void rubricFor;


const wrong = (id: string) => (ANSWER_KEY[id] % 4) + 1;
const ids = CHOICE_ITEMS.map((i) => i.id);

/** correct: 맞힌 객관식, blank: 비운 객관식, 나머지는 같은 오답 */
function attempt(name: string, correct: string[], opts: { blank?: string[]; self?: number[]; complete?: boolean } = {}): AnalysisAttempt {
  const responses: ResponseRow[] = ids
    .filter((id) => !opts.blank?.includes(id))
    .map((id) => ({ item_id: id, answer: { value: correct.includes(id) ? ANSWER_KEY[id] : wrong(id) }, response_ms: 10_000, pasted: false }));
  SELF_ITEMS.forEach((s, i) => responses.push({ item_id: s.id, answer: { value: opts.self?.[i] ?? 3 }, response_ms: 5_000, pasted: false }));
  const essayScores: Record<string, number> = opts.complete ? { E1: 50, E2: 50, E3: 50 } : {};
  const { detail } = scoreSubmission(responses, SET, ANSWER_KEY, essayScores);
  return { attemptId: name, employee_no: name, responses, essays: {}, detail };
}

describe("analyzeItems", () => {
  // A 전부 정답, B 첫 문항만 오답, C 첫 문항만 정답, D 전부 오답(2번 문항은 무응답)
  const [q1, q2] = ids;
  const attempts = [
    attempt("A", ids),
    attempt("B", ids.slice(1)),
    attempt("C", [q1]),
    attempt("D", [], { blank: [q2] }),
  ];
  const a = analyzeItems(attempts, SET, ANSWER_KEY, RUBRICS);

  it("computes difficulty, discrimination, and option counts by hand", () => {
    const s1 = a.choice.find((c) => c.itemId === q1)!;
    expect(s1).toMatchObject({ n: 4, p: 0.5, d: 1, r: 0 }); // 총점과 무관한 문항 → 상관 0
    expect(s1.flags).toContain("low-disc");
    const s2 = a.choice.find((c) => c.itemId === q2)!;
    expect(s2.p).toBe(0.5);
    expect(s2.blank).toBe(1);
    expect(s2.options[ANSWER_KEY[q2] - 1]).toBe(2);
    expect(s2.options[wrong(q2) - 1]).toBe(1); // C 만 오답, D 는 무응답
    expect(s2.r).toBeGreaterThan(0.9);
    expect(s2.flags).toContain("unused-option"); // 고른 사람 없는 오답 보기 2개
  });

  it("computes KR-20 from item variances", () => {
    const totals = [24, 23, 1, 0];
    const mean = totals.reduce((x, y) => x + y) / 4;
    const variance = totals.reduce((s, t) => s + (t - mean) ** 2, 0) / 4;
    const pq = a.choice.reduce((s, c) => s + c.p * (1 - c.p), 0); // 모든 문항 p = 0.5
    expect(a.kr20).toBe(Math.round((24 / 23) * (1 - pq / variance) * 100) / 100);
    expect(a.knowledge).toMatchObject({ mean: 50, min: 0, max: 100 });
  });

  it("flags easy and hard items", () => {
    const easy = analyzeItems([attempt("A", ids), attempt("B", ids)], SET, ANSWER_KEY, RUBRICS);
    expect(easy.choice[0].flags).toContain("easy");
    expect(easy.kr20).toBeNull(); // 총점 분산 0
    const hard = analyzeItems([attempt("A", []), attempt("B", [])], SET, ANSWER_KEY, RUBRICS);
    expect(hard.choice[0].flags).toContain("hard");
  });

  it("summarizes self-ratings and over/under estimation for complete results", () => {
    const b = analyzeItems(
      [attempt("A", ids, { self: [5, 5, 5, 5, 5, 5, 5, 5], complete: true }), attempt("B", [], { self: [5, 5, 5, 5, 5, 5, 5, 5], complete: true }), attempt("C", [], { self: [1, 1, 1, 1, 1, 1, 1, 1] })],
      SET, ANSWER_KEY, RUBRICS,
    );
    const p1 = b.self[0];
    expect(p1).toMatchObject({ n: 3, counts: [1, 0, 0, 0, 2] });
    expect(p1.mean).toBe(3.7);
    expect(b.complete).toBe(2);
    // M1(AI 원리)은 객관식만: A 100점, B 0점 → 실제 평균 50, 자기평가 100 → 과대평가 +50
    expect(p1).toMatchObject({ selfScore: 100, actual: 50, gap: 50 });
  });

  it("averages essay criteria and AI agreement", () => {
    const keys = RUBRICS[0].criteria.map((c) => c.key);
    const crit = (vals: number[]) => Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    const x = attempt("A", ids);
    const y = attempt("B", ids);
    x.essays.E1 = { final: crit([3, 3, 2, 4]), ai: crit([3, 4, 2, 4]) };
    y.essays.E1 = { final: crit([1, 3, 2, 4]), ai: crit([2, 3, 2, 4]) };
    const e1 = analyzeItems([x, y], SET, ANSWER_KEY, RUBRICS).essay.find((e) => e.itemId === "E1")!.criteria;
    expect(e1[0]).toMatchObject({ n: 2, mean: 2, aiMean: 2.5, agreement: 0.5, pairs: 2 });
    expect(e1[1]).toMatchObject({ mean: 3, agreement: 0.5 });
    expect(e1[3]).toMatchObject({ mean: 4, agreement: 1 });
  });
});
