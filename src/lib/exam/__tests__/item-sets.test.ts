import { describe, expect, it } from "vitest";
import { scoringKey } from "../answer-key.data";
import { CHAPTERS, MID_FACTORS, SUB_FACTORS } from "../factors";
import { ITEM_SET_VERSION, ITEM_SET_VERSIONS, itemSet } from "../items";

// v1 은 이미 응시 결과가 있어 바꾸지 않는다 (정답 번호가 2→3→4→1 로 반복되는 문제가 있음)
const LEGACY = new Set(["NEWHIRE-AI-v1"]);

/** 같은 번호가 연속으로 나오는 가장 긴 길이 */
const longestRun = (xs: number[]) => xs.reduce((acc, x, i) => {
  const run = i > 0 && x === xs[i - 1] ? acc.run + 1 : 1;
  return { run, best: Math.max(acc.best, run) };
}, { run: 0, best: 0 }).best;

/** 길이 p 의 반복(앞 p 개가 계속 되풀이)이 있는지 */
const hasPeriod = (xs: number[], p: number) => xs.every((x, i) => i < p || x === xs[i - p]);

describe.each(ITEM_SET_VERSIONS)("item set %s", (version) => {
  const set = itemSet(version);
  const key = scoringKey(version);

  it("keeps the exam structure: 3 choice items and 1 self item per factor, 3 essays", () => {
    for (const m of MID_FACTORS) {
      expect(set.choice.filter((i) => i.mid === m.id)).toHaveLength(3);
      expect(set.self.filter((i) => i.mid === m.id)).toHaveLength(1);
    }
    expect(set.essay.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
    expect(new Set(set.all.map((i) => i.id)).size).toBe(set.all.length);
  });

  it("links every item to a valid factor and chapter", () => {
    for (const i of set.choice) {
      expect(SUB_FACTORS.find((s) => s.id === i.sub)?.mid).toBe(i.mid);
      expect(i.options).toHaveLength(4);
      expect(new Set(i.options).size).toBe(4);
    }
    for (const i of set.all) expect(i.chapter in CHAPTERS).toBe(true);
  });

  it("has an answer for every choice item and a 4×4 rubric for every essay", () => {
    expect(Object.keys(key.answerKey).sort()).toEqual(set.choice.map((i) => i.id).sort());
    for (const i of set.choice) expect(key.answerKey[i.id]).toBeGreaterThanOrEqual(1);
    for (const i of set.choice) expect(key.answerKey[i.id]).toBeLessThanOrEqual(i.options.length);
    for (const e of set.essay) {
      const r = key.rubrics.find((x) => x.itemId === e.id)!;
      expect(r.criteria).toHaveLength(4);
      expect(new Set(r.criteria.map((c) => c.key)).size).toBe(4);
      for (const c of r.criteria) expect(c.levels.every((l) => l.trim().length > 0)).toBe(true);
    }
  });

  it.skipIf(LEGACY.has(version))("spreads answer positions evenly with no visible pattern", () => {
    const seq = set.choice.map((i) => key.answerKey[i.id]);
    const counts = [1, 2, 3, 4].map((n) => seq.filter((x) => x === n).length);
    expect(counts).toEqual([6, 6, 6, 6]);
    expect(longestRun(seq)).toBeLessThanOrEqual(2);
    for (let p = 1; p <= 8; p++) expect(hasPeriod(seq, p)).toBe(false);
  });
});

it("uses the newest version for new exams and rejects unknown versions", () => {
  expect(ITEM_SET_VERSIONS).toContain(ITEM_SET_VERSION);
  expect(() => itemSet("nope")).toThrow();
  expect(() => scoringKey("nope")).toThrow();
});

it("detects the v1 answer cycle that new versions must avoid", () => {
  const v1 = itemSet("NEWHIRE-AI-v1").choice.map((i) => scoringKey("NEWHIRE-AI-v1").answerKey[i.id]);
  expect(hasPeriod(v1, 4)).toBe(true);
});
