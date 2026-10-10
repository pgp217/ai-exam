import { describe, expect, it } from "vitest";
import { CHAPTERS, MID_FACTORS, SUB_FACTORS } from "../factors";
import {
  aiTypeOf, essayScoreFromCriteria, gradeOf, scoreAttempt, topPercent, type AttemptAnswers,
} from "../scoring";
import { assessReliability, longestStraightRun, type ReliabilityInput } from "../reliability";
import { itemSet } from "../items";
import { rubricFor as rubricOf, scoringKey } from "../answer-key.data";

// 기존 테스트는 문항 세트 v1 기준으로 검증한다
const SET = itemSet("NEWHIRE-AI-v1");
const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = SET;
const { answerKey: ANSWER_KEY, rubrics: RUBRICS } = scoringKey("NEWHIRE-AI-v1");
const rubricFor = (id: string) => rubricOf(scoringKey("NEWHIRE-AI-v1"), id);
void CHOICE_ITEMS; void SELF_ITEMS; void ESSAY_ITEMS; void RUBRICS; void rubricFor;


function answers(opts: { correct: boolean | ((id: string) => boolean); self?: number; essay?: number | null }): AttemptAnswers {
  const isCorrect = typeof opts.correct === "function" ? opts.correct : () => opts.correct as boolean;
  return {
    choice: Object.fromEntries(CHOICE_ITEMS.map((i) => [i.id, isCorrect(i.id) ? ANSWER_KEY[i.id] : (ANSWER_KEY[i.id] % 4) + 1])),
    self: Object.fromEntries(SELF_ITEMS.map((i) => [i.id, opts.self ?? 3])),
    essay: Object.fromEntries(ESSAY_ITEMS.map((e) => [e.id, opts.essay === undefined ? 100 : opts.essay])),
  };
}

describe("item bank", () => {
  it("has 24 choice items, 3 per mid factor, each tied to a sub factor and chapter", () => {
    expect(CHOICE_ITEMS).toHaveLength(24);
    for (const m of MID_FACTORS) expect(CHOICE_ITEMS.filter((i) => i.mid === m.id)).toHaveLength(3);
    for (const i of CHOICE_ITEMS) {
      expect(SUB_FACTORS.find((s) => s.id === i.sub)?.mid).toBe(i.mid);
      expect(CHAPTERS[i.chapter]).toBeDefined();
      expect(i.options).toHaveLength(4);
    }
  });

  it("has one self item per mid factor and 3 essays with rubrics", () => {
    expect(SELF_ITEMS.map((s) => s.mid).sort()).toEqual(MID_FACTORS.map((m) => m.id).sort());
    expect(ESSAY_ITEMS).toHaveLength(3);
    for (const e of ESSAY_ITEMS) expect(rubricFor(e.id).criteria).toHaveLength(4);
    expect(RUBRICS).toHaveLength(3);
  });

  it("has a valid answer for every choice item, spread evenly over positions", () => {
    expect(Object.keys(ANSWER_KEY).sort()).toEqual(CHOICE_ITEMS.map((i) => i.id).sort());
    const counts = [0, 0, 0, 0];
    for (const v of Object.values(ANSWER_KEY)) counts[v - 1]++;
    expect(counts).toEqual([6, 6, 6, 6]);
  });

  it("uses unique item ids", () => {
    const ids = [...CHOICE_ITEMS, ...SELF_ITEMS, ...ESSAY_ITEMS].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("grades and types", () => {
  it("maps scores to 8 grade bands with inclusive lower bounds", () => {
    const cases: [number, string][] = [
      [0, "D"], [29.9, "D"], [30, "D+"], [40, "C"], [50, "C+"], [60, "B"], [70, "B+"], [80, "A"], [89.9, "A"], [90, "A+"], [100, "A+"],
    ];
    for (const [s, g] of cases) expect(gradeOf(s)).toBe(g);
  });

  it("places knowledge x practice into the 3x3 type grid", () => {
    expect(aiTypeOf(90, 90).name).toBe("AI 에이스");
    expect(aiTypeOf(90, 20).name).toBe("이론 우선형");
    expect(aiTypeOf(20, 90).name).toBe("직관형 활용가");
    expect(aiTypeOf(60, 60).name).toBe("균형 성장형");
    expect(aiTypeOf(10, 10).name).toBe("AI 입문자");
    expect(aiTypeOf(75, 49.9).name).toBe("이론 우선형");
  });

  it("converts rubric criteria 1-4 to 0-100", () => {
    const r = rubricFor("E1");
    const all = (v: number) => Object.fromEntries(r.criteria.map((c) => [c.key, v]));
    expect(essayScoreFromCriteria(r, all(1))).toBe(0);
    expect(essayScoreFromCriteria(r, all(4))).toBe(100);
    expect(essayScoreFromCriteria(r, { elements: 4, specificity: 3, format: 2, safety: 1 })).toBe(50);
    expect(() => essayScoreFromCriteria(r, { ...all(2), format: 5 })).toThrow();
  });
});

describe("scoreAttempt", () => {
  it("gives 100 / A+ / AI 에이스 for a perfect attempt", () => {
    const r = scoreAttempt(answers({ correct: true, self: 5, essay: 100 }), SET, ANSWER_KEY);
    expect(r.status).toBe("complete");
    expect(r.knowledge).toBe(100);
    expect(r.total).toBe(100);
    expect(r.grade).toBe("A+");
    expect(r.aiType?.name).toBe("AI 에이스");
    expect(r.review).toEqual([]);
    expect(r.strengths).toEqual([]); // all mids equal → no strengths/weaknesses
  });

  it("stays in grading status until every essay is confirmed", () => {
    const a = answers({ correct: true, essay: 80 });
    a.essay.E2 = null;
    const r = scoreAttempt(a, SET, ANSWER_KEY);
    expect(r.status).toBe("grading");
    expect(r.total).toBeNull();
    expect(r.grade).toBeNull();
    expect(r.tops.find((t) => t.id === "understand")?.score).toBe(100); // no essay in AI 이해
    expect(r.tops.find((t) => t.id === "responsible")?.score).toBeNull();
    expect(r.tops.find((t) => t.id === "apply")?.score).toBe(88); // 100*0.4 + 80*0.6
  });

  it("weights top factors 40% choice and 60% essay", () => {
    const a = answers({ correct: true, essay: 50 });
    a.choice.Q07 = 1; // M3 wrong once → apply choice 8/9
    const r = scoreAttempt(a, SET, ANSWER_KEY);
    expect(r.tops.find((t) => t.id === "apply")?.score).toBe(65.6); // 88.89*0.4 + 50*0.6
    expect(r.tops.find((t) => t.id === "responsible")?.score).toBe(70); // 100*0.4 + 50*0.6
    expect(r.total).toBe(78.5); // (100 + 65.6 + 70) / 3 = 78.53
    expect(r.grade).toBe("B+");
    expect(r.aiType?.name).toBe("지식 탄탄형"); // knowledge 95.8, practice 50
  });

  it("flags self-rating gaps and picks strengths, weaknesses and review chapters", () => {
    const wrongInM6 = new Set(["Q16", "Q17", "Q18"]);
    const a = answers({ correct: (id) => !wrongInM6.has(id), self: 5, essay: 100 });
    a.essay.E2 = 0;
    const r = scoreAttempt(a, SET, ANSWER_KEY);
    const m6 = r.mids.find((m) => m.id === "M6")!;
    expect(m6.score).toBe(0);
    expect(m6.gap).toBe(100);
    expect(m6.gapNote).toBe("over");
    expect(r.weaknesses[0]).toBe("결과 검증");
    expect(r.review.map((c) => c.id)).toEqual(["ch09"]);
    expect(r.review[0]).toEqual({ id: "ch09", title: "Chapter 9 환각의 이해와 대응" });
  });

  it("treats unanswered choice items as wrong", () => {
    const a = answers({ correct: true });
    a.choice.Q01 = null;
    const r = scoreAttempt(a, SET, ANSWER_KEY);
    expect(r.mids.find((m) => m.id === "M1")?.wrongItems).toEqual(["Q01"]);
  });
});

describe("topPercent", () => {
  it("ranks within the cohort", () => {
    const cohort = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(topPercent(100, cohort)).toBe(10);
    expect(topPercent(10, cohort)).toBe(100);
    expect(topPercent(95, cohort)).toBe(20);
    expect(topPercent(50, [])).toBe(100);
  });
});

describe("reliability", () => {
  const base = (): ReliabilityInput => ({
    choice: Object.fromEntries(CHOICE_ITEMS.map((i) => [i.id, ANSWER_KEY[i.id]])),
    choiceMs: Object.fromEntries(CHOICE_ITEMS.map((i) => [i.id, 12000])),
    self: { P1: 3, P2: 4, P3: 3, P4: 2, P5: 4, P6: 3, P7: 5, P8: 4 },
    essayText: Object.fromEntries(ESSAY_ITEMS.map((e) => [e.id, "가".repeat(120)])),
    essayPasted: {},
  });

  it("counts straight runs", () => {
    expect(longestStraightRun([1, 1, 2, 2, 2, null, 2])).toBe(3);
  });

  it("is reliable for a normal attempt", () => {
    expect(assessReliability(base(), SET)).toEqual({ level: "reliable", signals: [] });
  });

  it("escalates with the number of signals", () => {
    const one = base();
    one.essayPasted.E1 = true;
    expect(assessReliability(one, SET)).toEqual({ level: "caution", signals: ["essay-paste"] });

    const many = base();
    many.choice = Object.fromEntries(CHOICE_ITEMS.map((i) => [i.id, 1]));
    many.choiceMs = Object.fromEntries(CHOICE_ITEMS.map((i) => [i.id, 1500]));
    many.self = Object.fromEntries(SELF_ITEMS.map((i) => [i.id, 3]));
    many.essayText.E3 = "안 합니다";
    const r = assessReliability(many, SET);
    expect(r.level).toBe("unreliable");
    expect(r.signals).toEqual(["too-fast", "straight-line", "flat-self", "essay-short"]);
  });
});
