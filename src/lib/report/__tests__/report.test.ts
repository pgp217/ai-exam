import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_KEY, RUBRICS } from "../../exam/answer-key.data";
import { simulateCohort } from "../../exam/simulate";
import { scoreSubmission } from "../../attempt/responses";
import { createMemoryStore, demoDb } from "../../attempt/memory-store";
import type { CohortMember, ResultRow } from "../../attempt/types";
import { binOf, cohortView, histogram, MIN_COHORT } from "../build";
import { filterResults, stageOf, summarize } from "../filter";
import { buildFeedbackPrompt, fakeFeedback, normalizeFeedback } from "../../feedback/feedback";

const sims = simulateCohort(30, ANSWER_KEY, RUBRICS);
const resultOf = (i: number) => scoreSubmission(sims[i].responses, ANSWER_KEY, sims[i].essayScores).detail;
const member = (i: number): CohortMember => {
  const r = resultOf(i);
  return { attemptId: `a${i}`, total: r.total!, knowledge: r.knowledge, practice: r.practice!, tops: Object.fromEntries(r.tops.map((t) => [t.id, t.score!])) };
};

describe("simulateCohort", () => {
  it("is deterministic and produces complete, varied results", () => {
    expect(simulateCohort(5, ANSWER_KEY, RUBRICS)).toEqual(simulateCohort(5, ANSWER_KEY, RUBRICS));
    const totals = sims.map((_, i) => resultOf(i).total!);
    expect(totals.every((t) => t >= 0 && t <= 100)).toBe(true);
    expect(new Set(totals.map(binOf)).size).toBeGreaterThanOrEqual(4); // 분포가 한 구간에 몰리지 않는다
    expect(sims.every((s) => s.name.startsWith("가상"))).toBe(true);
  });
});

describe("histogram and cohort view", () => {
  it("bins scores by 10 with 100 in the last bin", () => {
    expect(binOf(0)).toBe(0);
    expect(binOf(9.9)).toBe(0);
    expect(binOf(10)).toBe(1);
    expect(binOf(100)).toBe(9);
    expect(histogram([5, 15, 15, 100], 15)).toEqual({ bins: [1, 2, 0, 0, 0, 0, 0, 0, 0, 1], mine: 1 });
  });

  it("hides comparisons below the minimum cohort size", () => {
    const me = resultOf(0);
    const few = Array.from({ length: MIN_COHORT - 1 }, (_, i) => member(i));
    expect(cohortView(me, "a0", few)).toBeNull();
  });

  it("includes the candidate even if the cohort list does not yet", () => {
    const me = resultOf(0);
    const others = Array.from({ length: MIN_COHORT - 1 }, (_, i) => member(i + 1));
    const v = cohortView(me, "a0", others)!;
    expect(v.size).toBe(MIN_COHORT);
    expect(v.total.bins.reduce((s, x) => s + x, 0)).toBe(MIN_COHORT);
    expect(v.total.mine).toBe(binOf(me.total!));
  });

  it("ranks within the cohort", () => {
    const all = sims.map((_, i) => member(i));
    const best = all.reduce((a, b) => (b.total > a.total ? b : a));
    const i = Number(best.attemptId.slice(1));
    expect(cohortView(resultOf(i), best.attemptId, all)!.topPercent).toBe(Math.ceil(100 / 30));
  });
});

describe("results filters", () => {
  const row = (over: Partial<ResultRow>): ResultRow => ({
    candidateId: "c", candidate: { name: "김하늘", employee_no: "D-001", department: "경영지원팀", cohort: "2026-하반기" },
    exam: { id: "e1", title: "t" }, attempt: null, result: null, ...over,
  });
  const rows: ResultRow[] = [
    row({}),
    row({ candidateId: "b", candidate: { name: "이도윤", employee_no: "D-002", department: "영업1팀", cohort: "2026-하반기" }, attempt: { id: "a", status: "grading", submittedAt: null, reliability: { level: "caution", signals: [] } } }),
    row({ candidateId: "c2", candidate: { name: "박서연", employee_no: "D-003", department: "영업1팀", cohort: "2026-상반기" }, attempt: { id: "b", status: "complete", submittedAt: null, reliability: { level: "reliable", signals: [] } }, result: { status: "complete", total: 72.3, grade: "B+", aiType: "x", knowledge: 80, practice: 60, feedbackStatus: null } }),
  ];

  it("derives the stage", () => {
    expect(rows.map(stageOf)).toEqual(["not_started", "review", "complete"]);
  });

  it("filters by text, department, stage, reliability, and grade", () => {
    expect(filterResults(rows, { q: "d-002" }).map((r) => r.candidate.name)).toEqual(["이도윤"]);
    expect(filterResults(rows, { dept: "영업1팀" })).toHaveLength(2);
    expect(filterResults(rows, { stage: "not_started" })).toHaveLength(1);
    expect(filterResults(rows, { reliability: "caution" }).map((r) => r.candidate.name)).toEqual(["이도윤"]);
    expect(filterResults(rows, { grade: "B+", cohort: "2026-상반기" }).map((r) => r.candidate.name)).toEqual(["박서연"]);
    expect(summarize(rows)).toEqual({ total: 3, submitted: 2, complete: 1, avgTotal: 72.3 });
  });
});

describe("feedback content", () => {
  it("builds a prompt from scores and rubric levels without personal data", () => {
    const r = resultOf(0);
    const p = buildFeedbackPrompt(r, RUBRICS.map((rb) => ({ itemId: rb.itemId, criterionScores: sims[0].essayCriteria[rb.itemId], rubric: rb })));
    expect(p).toContain(`종합 ${r.total}점`);
    expect(p).toContain("<essays>");
    expect(p).not.toContain(sims[0].name);
    expect(p).not.toContain(sims[0].employee_no);
  });

  it("does not present level-1 rubric text as something the candidate did, and passes observed reasons", () => {
    const rb = RUBRICS.find((x) => x.itemId === "E2")!;
    const scores = { identify: 4, method: 3, logic: 1, decision: 1 };
    const p = buildFeedbackPrompt(resultOf(0), [{ itemId: "E2", criterionScores: scores, rubric: rb, observed: { decision: "사용 판단이 답안에 없습니다." } }]);
    const decision = rb.criteria.find((c) => c.key === "decision")!;
    expect(p).not.toContain(decision.levels[0]); // "그대로 사용하겠다고 했다"
    expect(p).toContain("최저 수준(다음 단계 미충족, 언급 없음 포함)");
    expect(p).toContain(`다음 단계(2점) 수준 설명: ${decision.levels[1]}`);
    expect(p).toContain("<observed>사용 판단이 답안에 없습니다.</observed>");
  });

  it("normalizes actions and drops unknown chapters", () => {
    const n = normalizeFeedback({ summary: " 요약 ", actions: [{ title: "a", detail: "b", chapter: "ch09" }, { title: "c", detail: "d", chapter: "none" }, { title: " ", detail: "x", chapter: "ch01" }] });
    expect(n).toEqual({ summary: "요약", actions: [{ title: "a", detail: "b", chapter: "ch09" }, { title: "c", detail: "d", chapter: null }] });
    expect(() => normalizeFeedback({ summary: "", actions: [] })).toThrow();
    expect(fakeFeedback(resultOf(0)).actions).toHaveLength(3);
  });
});

// ── 피드백 흐름: 결과 확정 → 초안 → 승인 → 점수 변경 시 다시 생성 필요 표시 ──
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

describe("feedback service (memory store, fake)", () => {
  beforeEach(() => {
    vi.stubEnv("EXAM_STORE", "memory");
    vi.stubEnv("AI_GRADER", "fake");
    (globalThis as { __examStore?: unknown }).__examStore = createMemoryStore(demoDb(Date.now(), { simulated: 6 }));
  });

  it("drafts on completion, publishes on approval, and flags score changes", async () => {
    const { getStore } = await import("../../attempt/store");
    const store = getStore() as ReturnType<typeof createMemoryStore>;
    const grading = await import("../../grading/service");
    const fb = await import("../../feedback/service");
    const attemptId = "sim-a1";

    // 확정 결과를 다시 계산하면(완료 상태) 초안이 생긴다
    expect(await grading.recomputeResult(attemptId)).toBe(true);
    await vi.waitFor(() => expect(store.db.results.get(attemptId)!.feedback?.status).toBe("draft"));
    const draft = store.db.results.get(attemptId)!.feedback!;
    expect(draft.model).toBe("fake-feedback");

    // 빈 요약은 거부, 정상 입력은 승인
    expect(await fb.saveReviewedFeedback({ attemptId, adminId: "adm", summary: " ", actions: draft.actions, approve: true })).toMatchObject({ ok: false });
    expect(await fb.saveReviewedFeedback({ attemptId, adminId: "adm", summary: "확인한 요약", actions: draft.actions, approve: true })).toEqual({ ok: true });
    const approved = store.db.results.get(attemptId)!.feedback!;
    expect(approved).toMatchObject({ status: "approved", summary: "확인한 요약", approved_by: "adm", stale: false });

    // 승인 뒤 서술형 확정 점수가 바뀌면 피드백은 그대로 두고 표시만 한다
    const review = (await store.getReviewAttempt(attemptId))!;
    const e1 = review.responses.find((r) => r.item_id === "E1")!;
    const final = store.db.finals.find((f) => f.response_id === e1.id)!;
    const flipped = Object.fromEntries(Object.entries(final.criterion_scores).map(([k, v]) => [k, v === 4 ? 1 : 4]));
    expect(await grading.confirmGrading({ attemptId, itemId: "E1", graderId: "adm", scores: flipped, reason: "재검토" })).toEqual({ ok: true, complete: true });
    expect(store.db.results.get(attemptId)!.feedback).toMatchObject({ status: "approved", summary: "확인한 요약", stale: true });

    // 결과 목록과 리포트에서도 보인다
    const rows = await store.listResults();
    expect(rows.find((r) => r.attempt?.id === attemptId)?.result?.feedbackStatus).toBe("approved");
    expect((await store.getCohort("demo-exam")).length).toBe(6);
  });
});
