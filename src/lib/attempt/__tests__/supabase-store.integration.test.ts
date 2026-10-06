// 실제 PostgREST(로컬 Postgres + 마이그레이션 0001~0003 + 가상 응시자 시드)에 대해 저장소 쿼리를 확인한다.
// 기본 npm test 에서는 건너뛴다. 실행: STORE_IT_URL=http://127.0.0.1:3900 STORE_IT_KEY=<service JWT> STORE_IT_EXAM=<exam_id> npx vitest run supabase-store
import { describe, expect, it } from "vitest";
import { createSupabaseStore } from "../supabase-store";

const url = process.env.STORE_IT_URL;
const key = process.env.STORE_IT_KEY;
const examId = process.env.STORE_IT_EXAM;

describe.skipIf(!url || !key || !examId)("supabase store (integration)", () => {
  it("reads the cohort, results list, exams, and a report; saves feedback", async () => {
    // describe 본문은 건너뛸 때도 실행되므로 저장소는 테스트 안에서 만든다
    const store = createSupabaseStore(url!, key!);
    const cohort = await store.getCohort(examId!);
    expect(cohort.length).toBeGreaterThanOrEqual(5);
    expect(cohort.every((m) => typeof m.total === "number" && Object.keys(m.tops).length === 3)).toBe(true);

    const rows = await store.listResults();
    const sims = rows.filter((r) => r.candidate.employee_no.startsWith("SIM-"));
    expect(sims.length).toBe(cohort.length);
    expect(rows.some((r) => r.attempt === null)).toBe(true); // 미응시 데모 응시자
    expect(sims[0].result).toMatchObject({ status: "complete" });
    // 이전 실행이 남긴 피드백이 없는 행을 골라 쓰고, 끝나면 되돌린다
    const target = sims.find((r) => r.result?.feedbackStatus == null)!;

    expect((await store.listExams()).some((e) => e.id === examId)).toBe(true);

    const attemptId = target.attempt!.id;
    const report = (await store.getReport(attemptId))!;
    expect(report.exam.id).toBe(examId);
    expect(report.result?.status).toBe("complete");
    expect(report.result?.feedback).toBeNull();

    await store.saveFeedback(attemptId, {
      status: "draft", summary: "요약", actions: [{ title: "t", detail: "d", chapter: "ch01" }],
      model: "test", generated_at: new Date().toISOString(), basis: { total: 1, practice: 1 },
    });
    expect((await store.getReport(attemptId))!.result?.feedback).toMatchObject({ status: "draft", summary: "요약" });
    expect((await store.listResults()).find((r) => r.attempt?.id === attemptId)?.result?.feedbackStatus).toBe("draft");
    await fetch(`${url!.replace(/\/+$/, "")}/rest/v1/results?attempt_id=eq.${attemptId}`, {
      method: "PATCH", headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ feedback: null }),
    });
  });
});

describe.skipIf(!url || !key)("supabase store exam admin (integration)", () => {
  it("creates an exam, upserts candidates, saves notices, and deletes safely", async () => {
    const store = createSupabaseStore(url!, key!);
    const examId = await store.createExam(
      { title: "[통합 테스트] 시험", starts_at: "2027-01-01T00:00:00Z", ends_at: "2027-01-08T00:00:00Z", time_limit_min: 40, intro_text: "안내", show_result: true, item_set_version: "NEWHIRE-AI-v1" },
      null,
    );
    try {
      expect(await store.getExam(examId)).toMatchObject({ title: "[통합 테스트] 시험", status: "draft" });
      await store.updateExam(examId, { time_limit_min: 45, status: "open" });
      expect(await store.getExam(examId)).toMatchObject({ time_limit_min: 45, status: "open" });

      const base = { email: null, phone: null, department: null, cohort: null, joined_at: null };
      expect(await store.upsertCandidates(examId, [{ ...base, employee_no: "T1", name: "가" }, { ...base, employee_no: "T2", name: "나" }])).toEqual({ inserted: 2, updated: 0 });
      const before = await store.listCandidates(examId);
      expect(await store.upsertCandidates(examId, [{ ...base, employee_no: "T1", name: "가", department: "인사팀" }, { ...base, employee_no: "T3", name: "다" }])).toEqual({ inserted: 1, updated: 1 });
      const after = await store.listCandidates(examId);
      const t1 = after.find((c) => c.employee_no === "T1")!;
      expect(t1).toMatchObject({ department: "인사팀", attemptStatus: null, access_token: before.find((c) => c.employee_no === "T1")!.access_token });
      expect(after.map((c) => c.employee_no)).toEqual(["T1", "T2", "T3"]);

      const summary = (await store.listExamSummaries()).find((e) => e.id === examId)!;
      expect(summary).toMatchObject({ candidates: 3, started: 0, submitted: 0, complete: 0 });

      await store.startAttempt(t1.id);
      expect((await store.listExamSummaries()).find((e) => e.id === examId)).toMatchObject({ started: 1, submitted: 0 });
      expect(await store.deleteCandidate(examId, t1.id)).toBe(false); // 응시 기록 있음
      const t2 = after.find((c) => c.employee_no === "T2")!;
      expect(await store.deleteCandidate(examId, t2.id)).toBe(true);
      expect(await store.deleteCandidate("00000000-0000-0000-0000-000000000000", t1.id)).toBe(false); // 다른 시험

      await store.saveNotice(examId, { channel: "email", subject: "제목", body: "본문" });
      await store.saveNotice(examId, { channel: "email", subject: "제목2", body: "본문2" });
      await store.saveNotice(examId, { channel: "sms", subject: null, body: "문자" });
      const notices = await store.getNotices(examId);
      expect(notices.map((n) => [n.channel, n.subject, n.body]).sort()).toEqual([["email", "제목2", "본문2"], ["sms", null, "문자"]]);
    } finally {
      await fetch(`${url!.replace(/\/+$/, "")}/rest/v1/exams?id=eq.${examId}`, { method: "DELETE", headers: { apikey: key!, Authorization: `Bearer ${key}` } });
    }
  });
});
