import { describe, expect, it } from "vitest";
import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "../../exam/items";
import { ANSWER_KEY } from "../../exam/answer-key.data";
import { InvalidResponseError, mergeResponses, parseResponses, scoreSubmission } from "../responses";
import { acceptsAnswers, attemptDeadline, durationSec, examWindow, GRACE_MS } from "../timing";
import { createMemoryStore, demoDb } from "../memory-store";
import type { AttemptRow, ExamRow, ResponseRow } from "../types";

const T0 = Date.parse("2026-10-06T00:00:00Z");

const exam = (over: Partial<ExamRow> = {}): ExamRow => ({
  id: "e", title: "t", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-10T00:00:00Z",
  time_limit_min: 40, intro_text: "", show_result: false, item_set_version: "v1", status: "open", ...over,
});
const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: "a", candidate_id: "c", started_at: new Date(T0).toISOString(), submitted_at: null, duration_sec: null, status: "in_progress", ...over,
});

function fullResponses(opts: { correct: boolean; ms?: number; essay?: string; pasted?: boolean }): ResponseRow[] {
  return [
    ...SELF_ITEMS.map((i, n) => ({ item_id: i.id, answer: { value: (n % 5) + 1 }, response_ms: 4000, pasted: false })),
    ...CHOICE_ITEMS.map((i) => ({
      item_id: i.id,
      answer: { value: opts.correct ? ANSWER_KEY[i.id] : (ANSWER_KEY[i.id] % 4) + 1 },
      response_ms: opts.ms ?? 15000,
      pasted: false,
    })),
    ...ESSAY_ITEMS.map((i) => ({ item_id: i.id, answer: { text: opts.essay ?? "가".repeat(80) }, response_ms: 60000, pasted: opts.pasted ?? false })),
  ];
}

describe("parseResponses", () => {
  it("accepts valid choice, self and essay answers", () => {
    const rows = parseResponses([
      { item_id: "Q01", answer: { value: 2 }, response_ms: 1000 },
      { item_id: "P1", answer: { value: 5 }, response_ms: null, pasted: true },
      { item_id: "E1", answer: { text: "프롬프트" }, response_ms: 5, pasted: true },
    ]);
    expect(rows).toEqual([
      { item_id: "Q01", answer: { value: 2 }, response_ms: 1000, pasted: false },
      { item_id: "P1", answer: { value: 5 }, response_ms: null, pasted: false }, // 붙여넣기는 서술형만
      { item_id: "E1", answer: { text: "프롬프트" }, response_ms: 5, pasted: true },
    ]);
  });

  it.each([
    ["not an array", {}],
    ["unknown item", [{ item_id: "Q99", answer: { value: 1 } }]],
    ["duplicate item", [{ item_id: "Q01", answer: { value: 1 } }, { item_id: "Q01", answer: { value: 2 } }]],
    ["choice out of range", [{ item_id: "Q01", answer: { value: 5 } }]],
    ["self out of range", [{ item_id: "P1", answer: { value: 0 } }]],
    ["non-integer value", [{ item_id: "Q01", answer: { value: 1.5 } }]],
    ["essay given a value", [{ item_id: "E1", answer: { value: 1 } }]],
    ["choice given text", [{ item_id: "Q01", answer: { text: "2" } }]],
    ["essay too long", [{ item_id: "E1", answer: { text: "가".repeat(4001) } }]],
    ["negative ms", [{ item_id: "Q01", answer: { value: 1 }, response_ms: -1 }]],
    ["missing answer", [{ item_id: "Q01" }]],
  ])("rejects %s", (_name, input) => {
    expect(() => parseResponses(input)).toThrow(InvalidResponseError);
  });
});

describe("mergeResponses", () => {
  it("overwrites by item, keeps paste flags, and returns items in bank order", () => {
    const saved: ResponseRow[] = [
      { item_id: "E1", answer: { text: "a" }, response_ms: 10, pasted: true },
      { item_id: "Q02", answer: { value: 1 }, response_ms: 10, pasted: false },
    ];
    const merged = mergeResponses(saved, [
      { item_id: "E1", answer: { text: "ab" }, response_ms: 20, pasted: false },
      { item_id: "Q01", answer: { value: 3 }, response_ms: 5, pasted: false },
    ]);
    expect(merged.map((r) => r.item_id)).toEqual(["Q01", "Q02", "E1"]);
    expect(merged[2]).toEqual({ item_id: "E1", answer: { text: "ab" }, response_ms: 20, pasted: true });
  });
});

describe("scoreSubmission", () => {
  it("scores choice items and leaves essays pending", () => {
    const s = scoreSubmission(fullResponses({ correct: true }), ANSWER_KEY);
    expect(s.knowledge).toBe(100);
    expect(s.detail.status).toBe("grading");
    expect(s.detail.practice).toBeNull();
    expect(s.detail.tops.find((t) => t.id === "understand")?.score).toBe(100); // 서술형이 없는 상위요인은 바로 확정
    expect(s.detail.tops.find((t) => t.id === "apply")?.score).toBeNull();
    expect(s.reliability).toEqual({ level: "reliable", signals: [] });
  });

  it("treats missing answers as wrong and flags reliability signals", () => {
    const rows = fullResponses({ correct: false, ms: 1200, essay: "짧음", pasted: true }).filter((r) => r.item_id !== "Q24");
    const s = scoreSubmission(rows, ANSWER_KEY);
    expect(s.knowledge).toBe(0);
    expect(s.reliability.level).toBe("unreliable");
    expect(s.reliability.signals).toEqual(["too-fast", "essay-paste", "essay-short"]);
  });

  it("scores an empty submission without throwing", () => {
    const s = scoreSubmission([], ANSWER_KEY);
    expect(s.knowledge).toBe(0);
    expect(s.reliability.signals).toContain("essay-short");
  });
});

describe("timing", () => {
  it("reports the exam window", () => {
    expect(examWindow(exam(), T0)).toBe("open");
    expect(examWindow(exam({ status: "draft" }), T0)).toBe("closed");
    expect(examWindow(exam({ starts_at: "2026-10-07T00:00:00Z" }), T0)).toBe("not-yet");
    expect(examWindow(exam({ ends_at: "2026-10-06T00:00:00Z" }), T0)).toBe("ended");
  });

  it("caps the deadline at the end of the exam window", () => {
    expect(attemptDeadline(exam(), attempt())).toBe(T0 + 40 * 60_000);
    expect(attemptDeadline(exam({ ends_at: "2026-10-06T00:10:00Z" }), attempt())).toBe(T0 + 10 * 60_000);
  });

  it("accepts answers until the deadline plus grace", () => {
    const end = T0 + 40 * 60_000;
    expect(acceptsAnswers(exam(), attempt(), end + GRACE_MS)).toBe(true);
    expect(acceptsAnswers(exam(), attempt(), end + GRACE_MS + 1)).toBe(false);
    expect(acceptsAnswers(exam({ status: "closed" }), attempt(), T0)).toBe(false);
    expect(acceptsAnswers(exam(), attempt({ status: "submitted" }), T0)).toBe(false);
  });

  it("does not count time past the deadline", () => {
    expect(durationSec(exam(), attempt(), T0 + 90_500)).toBe(91);
    expect(durationSec(exam(), attempt(), T0 + 3 * 3600_000)).toBe(40 * 60);
  });
});

describe("memory store", () => {
  it("runs start → save → submit once", async () => {
    const store = createMemoryStore(demoDb());
    const s0 = await store.findSession("demo");
    expect(s0?.attempt).toBeNull();
    expect(await store.findSession("nope")).toBeNull();

    await store.startAttempt(s0!.candidate.id);
    await store.startAttempt(s0!.candidate.id); // 두 번 시작해도 시도는 하나
    expect(store.db.attempts).toHaveLength(1);

    const { attempt: a } = (await store.findSession("demo"))!;
    expect(await store.saveResponses(a!.id, [{ item_id: "E1", answer: { text: "x" }, response_ms: 1, pasted: true }])).toBe(true);
    expect(await store.saveResponses(a!.id, [{ item_id: "E1", answer: { text: "xy" }, response_ms: 2, pasted: false }])).toBe(true);

    const input = { attemptId: a!.id, responses: [], durationSec: 10, reliability: {}, knowledgeScore: 50, detail: {} };
    expect(await store.submitAttempt(input)).toBe(true);
    expect(await store.submitAttempt(input)).toBe(false);
    expect(await store.saveResponses(a!.id, [{ item_id: "Q01", answer: { value: 1 }, response_ms: 1, pasted: false }])).toBe(false);

    const s = (await store.findSession("demo"))!;
    expect(s.attempt?.status).toBe("submitted");
    expect(s.responses).toEqual([{ item_id: "E1", answer: { text: "xy" }, response_ms: 2, pasted: true }]);
  });
});
