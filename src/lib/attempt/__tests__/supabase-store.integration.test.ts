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
    expect(sims[0].result).toMatchObject({ status: "complete", feedbackStatus: null });

    expect((await store.listExams()).some((e) => e.id === examId)).toBe(true);

    const attemptId = sims[0].attempt!.id;
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
  });
});
