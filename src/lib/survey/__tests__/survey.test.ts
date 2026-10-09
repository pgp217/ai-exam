import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, demoDb } from "../../attempt/memory-store";
import { InvalidSurveyError, parseSurvey, summarizeSurveys } from "../survey";

const answers = { difficulty: 3, time: 2, clarity: 4, relevance: 5, usability: 4 };

describe("parseSurvey", () => {
  it("accepts five 1-5 answers and normalizes text", () => {
    expect(parseSurvey({ answers, had_issue: true, issue: " 저장 오류\r\n발생 ", comment: "  " })).toEqual({
      answers, had_issue: true, issue: "저장 오류\n발생", comment: null,
    });
    // 오류가 없었다고 하면 오류 내용은 버린다
    expect(parseSurvey({ answers, had_issue: false, issue: "x", comment: "좋음" })).toMatchObject({ issue: null, comment: "좋음" });
  });

  it("rejects missing or out-of-range answers and bad text", () => {
    expect(() => parseSurvey({ answers: { ...answers, time: 6 }, had_issue: false })).toThrow(InvalidSurveyError);
    expect(() => parseSurvey({ answers: { ...answers, time: 2.5 }, had_issue: false })).toThrow(InvalidSurveyError);
    expect(() => parseSurvey({ answers: { difficulty: 3 }, had_issue: false })).toThrow(InvalidSurveyError);
    expect(() => parseSurvey({ answers })).toThrow(InvalidSurveyError); // had_issue 없음
    expect(() => parseSurvey({ answers, had_issue: false, comment: "가".repeat(1001) })).toThrow(InvalidSurveyError);
    expect(() => parseSurvey({ answers, had_issue: false, comment: 3 })).toThrow(InvalidSurveyError);
    expect(() => parseSurvey(null)).toThrow(InvalidSurveyError);
  });

  it("summarizes means and distributions", () => {
    const s = summarizeSurveys([
      { answers, had_issue: false },
      { answers: { ...answers, difficulty: 4, time: 1 }, had_issue: true },
      { answers: { ...answers, difficulty: 4 }, had_issue: false },
    ]);
    expect(s.count).toBe(3);
    expect(s.issueCount).toBe(1);
    expect(s.questions.find((q) => q.id === "difficulty")).toEqual({ id: "difficulty", mean: 3.7, counts: [0, 0, 1, 2, 0] });
    expect(s.questions.find((q) => q.id === "time")!.mean).toBe(1.7);
    expect(summarizeSurveys([]).questions[0].mean).toBeNull();
  });
});

// ── 응시 흐름 (메모리 저장소) ────────────────────────────
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));

describe("survey flow", () => {
  let store: ReturnType<typeof createMemoryStore>;
  beforeEach(() => {
    vi.stubEnv("EXAM_STORE", "memory");
    store = createMemoryStore(demoDb(Date.now(), { simulated: 5 }));
    (globalThis as { __examStore?: unknown }).__examStore = store;
  });
  const body = { answers, had_issue: true, issue: "타이머가 잠깐 멈춤", comment: "좋았어요" };

  it("takes one survey per submitted attempt when the exam collects surveys", async () => {
    const svc = await import("../../attempt/service");
    expect(await svc.submitSurvey("demo", body)).toMatchObject({ ok: false, status: 409 }); // 응시 전
    await svc.startAttempt("demo");
    expect(await svc.submitSurvey("demo", body)).toMatchObject({ ok: false, status: 409 }); // 응시 중
    expect(await svc.submitAttempt("demo", { responses: [] })).toEqual({ ok: true });
    expect(await svc.loadSession("demo")).toMatchObject({ state: "submitted", survey: "ask" });

    expect(await svc.submitSurvey("demo", { ...body, answers: { difficulty: 3 } })).toMatchObject({ ok: false, status: 400 });
    expect(await svc.submitSurvey("demo", body)).toEqual({ ok: true });
    expect(await svc.submitSurvey("demo", body)).toMatchObject({ ok: false, status: 409 }); // 두 번째
    expect(await svc.loadSession("demo")).toMatchObject({ state: "submitted", survey: "done" });
    expect(await svc.submitSurvey("nope", body)).toMatchObject({ ok: false, status: 404 });

    const rows = await store.listSurveys("demo-exam");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ candidate: { name: "김하늘" }, exam: { id: "demo-exam" }, had_issue: true, issue: "타이머가 잠깐 멈춤", answers });
    expect(await store.listSurveys("other-exam")).toEqual([]);
  });

  it("does not take surveys when the exam has them off", async () => {
    store.db.exams[0].collect_survey = false;
    const svc = await import("../../attempt/service");
    await svc.startAttempt("demo");
    await svc.submitAttempt("demo", { responses: [] });
    expect(await svc.loadSession("demo")).toMatchObject({ state: "submitted", survey: "off" });
    expect(await svc.submitSurvey("demo", body)).toMatchObject({ ok: false, status: 404 });
  });

  it("archives the survey with the attempt on retake", async () => {
    const svc = await import("../../attempt/service");
    const exams = await import("../../exams/service");
    await svc.startAttempt("demo");
    await svc.submitAttempt("demo", { responses: [] });
    await svc.submitSurvey("demo", body);
    expect(await exams.grantRetake("demo-exam", "demo-c1", { reason: "오류 신고" }, null)).toEqual({ ok: true });
    expect(store.db.archives[0].snapshot.survey).toMatchObject({ issue: "타이머가 잠깐 멈춤" });
    expect(await store.listSurveys("demo-exam")).toEqual([]);
  });
});
