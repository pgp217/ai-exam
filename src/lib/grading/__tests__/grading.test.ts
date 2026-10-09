import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidGraderOutputError, agreementRate, buildUserPrompt, differsFromAi, fakeGrade, gradeEmpty, normalizeOutput,
  parseCriterionScores, quoteFound, type GraderOutput,
} from "../grade";
import { missingEssayRows, scoreSubmission } from "../../attempt/responses";
import { createMemoryStore, demoDb } from "../../attempt/memory-store";
import type { ResponseRow } from "../../attempt/types";
import { itemSet } from "../../exam/items";
import { rubricFor as rubricOf, scoringKey } from "../../exam/answer-key.data";

// 기존 테스트는 문항 세트 v1 기준으로 검증한다
const SET = itemSet("NEWHIRE-AI-v1");
const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = SET;
const { answerKey: ANSWER_KEY, rubrics: RUBRICS } = scoringKey("NEWHIRE-AI-v1");
const rubricFor = (id: string) => rubricOf(scoringKey("NEWHIRE-AI-v1"), id);
void CHOICE_ITEMS; void SELF_ITEMS; void ESSAY_ITEMS; void RUBRICS; void rubricFor;


const E1 = ESSAY_ITEMS[0];
const R1 = rubricFor("E1");

const output = (scores: number[], quotes: string[][] = []): GraderOutput => ({
  criteria: R1.criteria.map((c, i) => ({ key: c.key, score: scores[i], reason: `이유 ${c.key}`, quotes: quotes[i] ?? [] })),
  summary: "요약",
});

describe("prompt", () => {
  it("includes the scenario, every criterion level, and the answer inside tags", () => {
    const p = buildUserPrompt(E1, R1, "내 답안");
    expect(p).toContain(E1.scenario);
    for (const c of R1.criteria) {
      expect(p).toContain(`key="${c.key}"`);
      c.levels.forEach((l, i) => expect(p).toContain(`${i + 1}점: ${l}`));
    }
    expect(p).toMatch(/<answer>\n내 답안\n<\/answer>/);
  });
});

describe("normalizeOutput", () => {
  const answer = "당신은 HR 담당자입니다.\n  신입 3명의 첫 주 OJT 일정표를 표로 만들어 주세요.";

  it("computes the score from criterion scores and verifies quotes", () => {
    const g = normalizeOutput(R1, output([4, 3, 2, 1], [["당신은 HR 담당자입니다."], ["신입 3명의 첫 주"], ["표로 만들어 주세요"], ["지어낸 문장"]]), answer);
    expect(g.criterionScores).toEqual({ elements: 4, specificity: 3, format: 2, safety: 1 });
    expect(g.score).toBe(50); // (10-4)/12
    expect(g.reasons.elements).toBe("이유 elements");
    expect(g.evidence.map((e) => e.verified)).toEqual([true, true, true, false]);
  });

  it("ignores whitespace differences when verifying quotes", () => {
    expect(quoteFound(answer, "입니다. 신입 3명의")).toBe(true);
    expect(quoteFound(answer, "  ")).toBe(false);
  });

  it.each([
    ["a missing criterion", { criteria: output([1, 1, 1, 1]).criteria.slice(1), summary: "" }],
    ["a duplicated criterion", { criteria: [...output([1, 1, 1, 1]).criteria, output([2, 2, 2, 2]).criteria[0]], summary: "" }],
    ["an unknown criterion", { criteria: [...output([1, 1, 1, 1]).criteria, { key: "x", score: 1, reason: "", quotes: [] }], summary: "" }],
    ["a score out of range", output([5, 1, 1, 1])],
    ["a non-integer score", output([2.5, 1, 1, 1])],
  ])("rejects %s", (_n, out) => {
    expect(() => normalizeOutput(R1, out as GraderOutput, answer)).toThrow(InvalidGraderOutputError);
  });
});

describe("fake grader and empty answers", () => {
  it("is deterministic and always produces a valid output", () => {
    for (const e of ESSAY_ITEMS) {
      const r = rubricFor(e.id);
      const text = "당신은 담당자입니다. 금요일 회고와 9시~18시를 반영해 표로 만들어 주세요. 개인정보는 가명 처리하고 출처를 확인합니다.";
      expect(fakeGrade(r, text)).toEqual(fakeGrade(r, text));
      const g = normalizeOutput(r, fakeGrade(r, text), text);
      expect(Object.keys(g.criterionScores)).toHaveLength(4);
      expect(g.evidence.every((x) => x.verified)).toBe(true);
    }
  });

  it("gives an empty answer the minimum score", () => {
    expect(gradeEmpty(R1).score).toBe(0);
    expect(Object.values(gradeEmpty(R1).criterionScores)).toEqual([1, 1, 1, 1]);
  });
});

describe("reviewer input", () => {
  it("parses 1..4 per criterion", () => {
    expect(parseCriterionScores(R1, { elements: "4", specificity: "3", format: "2", safety: "1" })).toEqual({ elements: 4, specificity: 3, format: 2, safety: 1 });
    expect(typeof parseCriterionScores(R1, { elements: "4", specificity: "3", format: "2" })).toBe("string");
    expect(typeof parseCriterionScores(R1, { elements: "0", specificity: "3", format: "2", safety: "1" })).toBe("string");
  });

  it("detects changes from the AI scores", () => {
    const ai = { elements: 3, specificity: 3, format: 3, safety: 3 };
    expect(differsFromAi(R1, { ...ai }, ai)).toBe(false);
    expect(differsFromAi(R1, { ...ai, safety: 4 }, ai)).toBe(true);
    expect(differsFromAi(R1, { ...ai, safety: 4 }, null)).toBe(false);
  });

  it("computes criterion-level agreement", () => {
    const ai = { a: 1, b: 2, c: 3, d: 4 };
    expect(agreementRate([{ ai, final: { a: 1, b: 2, c: 3, d: 3 } }, { ai, final: { ...ai } }])).toEqual({ rate: 87.5, matched: 7, total: 8 });
    expect(agreementRate([])).toEqual({ rate: null, matched: 0, total: 0 });
  });
});

describe("final scoring", () => {
  it("adds empty rows for unanswered essays", () => {
    expect(missingEssayRows([{ item_id: "E2" }], SET).map((r) => r.item_id)).toEqual(["E1", "E3"]);
  });

  it("completes the result once every essay has a confirmed score", () => {
    const rows: ResponseRow[] = Object.entries(ANSWER_KEY).map(([id, v]) => ({ item_id: id, answer: { value: v }, response_ms: 10000, pasted: false }));
    expect(scoreSubmission(rows, SET, ANSWER_KEY, { E1: 100, E2: 100 }).detail.status).toBe("grading");
    const done = scoreSubmission(rows, SET, ANSWER_KEY, { E1: 100, E2: 100, E3: 100 }).detail;
    expect(done.status).toBe("complete");
    expect(done.total).toBe(100);
    expect(done.grade).toBe("A+");
  });
});

// ── 서비스: 메모리 저장소 + 가짜 채점으로 제출 → AI 채점 → 확정 → 결과 ─────────
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

describe("grading service (memory store, fake grader)", () => {
  beforeEach(() => {
    vi.stubEnv("EXAM_STORE", "memory");
    vi.stubEnv("AI_GRADER", "fake");
    (globalThis as { __examStore?: unknown }).__examStore = createMemoryStore(demoDb());
  });

  async function submittedAttempt() {
    const { getStore } = await import("../../attempt/store");
    const store = getStore() as ReturnType<typeof createMemoryStore>;
    const s = (await store.findSession("demo"))!;
    await store.startAttempt(s.candidate.id);
    const attemptId = store.db.attempts[0].id;
    const answers: ResponseRow[] = [
      ...Object.entries(ANSWER_KEY).map(([id, v]) => ({ item_id: id, answer: { value: v }, response_ms: 10000, pasted: false })),
      { item_id: "E1", answer: { text: "당신은 HR 담당자입니다. 신입 3명의 첫 주 OJT 일정표를 표로 만들어 주세요. 9시~18시, 금요일 회고." }, response_ms: 60000, pasted: false },
      { item_id: "E2", answer: { text: "87.3%와 42%의 출처를 OO연구원 원문 보고서에서 확인하고, 인과관계 비약을 지적한 뒤 확인 전에는 보류합니다." }, response_ms: 60000, pasted: false },
      // E3 은 미응답
    ];
    await store.submitAttempt({ attemptId, responses: [...answers, ...missingEssayRows(answers, SET)], durationSec: 600, reliability: null, knowledgeScore: 100, detail: {} });
    return { store, attemptId };
  }

  it("grades all essays, requires a reason for overrides, and completes the result", async () => {
    const { store, attemptId } = await submittedAttempt();
    const svc = await import("../service");

    const run = await svc.gradeAttemptEssays(attemptId);
    expect(run.failed).toEqual([]);
    expect(run.graded.sort()).toEqual(["E1", "E2", "E3"]);
    expect(store.db.attempts[0].status).toBe("grading");
    const e3 = store.db.aiGradings.find((g) => g.model === "rule:empty-answer");
    expect(e3?.score).toBe(0);

    // 다시 실행해도 이미 채점한 문항은 건너뛴다
    expect((await svc.gradeAttemptEssays(attemptId)).graded).toEqual([]);

    const review = (await store.getReviewAttempt(attemptId))!;
    const aiFor = (itemId: string) => {
      const resp = review.responses.find((r) => r.item_id === itemId)!;
      return review.aiGradings.find((g) => g.response_id === resp.id)!;
    };
    const adminId = "admin-1";

    // AI 와 같은 점수: 사유 없이 확정
    const same = await svc.confirmGrading({ attemptId, itemId: "E1", graderId: adminId, scores: aiFor("E1").criterion_scores, reason: "" });
    expect(same).toEqual({ ok: true, complete: false });

    // AI 와 다른 점수: 사유가 없으면 거부
    const changed = { ...aiFor("E2").criterion_scores, logic: aiFor("E2").criterion_scores.logic === 4 ? 3 : 4 };
    expect(await svc.confirmGrading({ attemptId, itemId: "E2", graderId: adminId, scores: changed, reason: " " })).toMatchObject({ ok: false });
    expect(await svc.confirmGrading({ attemptId, itemId: "E2", graderId: adminId, scores: changed, reason: "인과 비약을 정확히 설명함" })).toEqual({ ok: true, complete: false });

    const done = await svc.confirmGrading({ attemptId, itemId: "E3", graderId: adminId, scores: aiFor("E3").criterion_scores, reason: "" });
    expect(done).toEqual({ ok: true, complete: true });
    expect(store.db.attempts[0].status).toBe("complete");
    const result = store.db.results.get(attemptId)!;
    expect(result.status).toBe("complete");
    expect(result.grade).not.toBeNull();
    expect(store.db.finals.find((f) => f.override_reason)?.ai_grading_id).toBe(aiFor("E2").id);

    // 확정 점수를 고치면 결과도 다시 계산한다
    const before = result.total;
    await svc.confirmGrading({ attemptId, itemId: "E1", graderId: adminId, scores: { elements: 4, specificity: 4, format: 4, safety: 4 }, reason: "전부 충족" });
    expect(store.db.results.get(attemptId)!.total).toBeGreaterThanOrEqual(before!);
  });

  it("rejects confirmations for unknown items or attempts", async () => {
    const { attemptId } = await submittedAttempt();
    const svc = await import("../service");
    expect(await svc.confirmGrading({ attemptId, itemId: "Q01", graderId: "a", scores: {}, reason: "" })).toMatchObject({ ok: false });
    expect(await svc.confirmGrading({ attemptId: "nope", itemId: "E1", graderId: "a", scores: {}, reason: "" })).toMatchObject({ ok: false });
  });
});
