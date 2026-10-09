import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore, demoDb } from "../../attempt/memory-store";
import { mapHeaders, normalizeDate, normalizePhone, parseCandidateRows, revalidate } from "../candidates";
import { dDay, isoToKstInput, kstInputToIso, parseBasic, parseSite } from "../form";
import { csvCell, noticeVars, renderTemplate, smsBytes, smsKind } from "../notice";
import { buildTemplate, readSheet } from "../xlsx";

describe("exam form", () => {
  it("converts KST input to ISO and back", () => {
    expect(kstInputToIso("2026-10-07T09:00")).toBe("2026-10-07T00:00:00.000Z");
    expect(isoToKstInput("2026-10-07T00:00:00.000Z")).toBe("2026-10-07T09:00");
    expect(kstInputToIso("2026-13-01T09:00")).toBeNull();
    expect(kstInputToIso("")).toBeNull();
  });

  it("validates basic settings", () => {
    expect(parseBasic({ title: " 시험 ", starts: "2026-10-07T09:00", ends: "2026-10-14T18:00" })).toEqual({
      ok: true, value: { title: "시험", starts_at: "2026-10-07T00:00:00.000Z", ends_at: "2026-10-14T09:00:00.000Z" },
    });
    const bad = parseBasic({ title: "", starts: "2026-10-14T09:00", ends: "2026-10-07T09:00" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["ends", "title"]);
  });

  it("validates site settings", () => {
    expect(parseSite({ time_limit_min: "40", intro_text: " 안내 ", show_result: "on" })).toEqual({ ok: true, value: { time_limit_min: 40, intro_text: "안내", show_result: true, collect_survey: false } });
    expect(parseSite({ time_limit_min: "40", intro_text: "", collect_survey: "on" })).toMatchObject({ ok: true, value: { show_result: false, collect_survey: true } });
    expect(parseSite({ time_limit_min: "40", intro_text: "", show_result: null })).toMatchObject({ ok: true, value: { show_result: false } });
    expect(parseSite({ time_limit_min: "40", intro_text: "a\r\nb" })).toMatchObject({ ok: true, value: { intro_text: "a\nb" } });
    expect(parseSite({ time_limit_min: "4", intro_text: "" }).ok).toBe(false);
    expect(parseSite({ time_limit_min: "40.5", intro_text: "" }).ok).toBe(false);
    expect(parseSite({ time_limit_min: "40", intro_text: "가".repeat(2001) }).ok).toBe(false);
  });

  it("labels D-day by KST calendar day", () => {
    const exam = { starts_at: "2026-10-10T00:00:00.000Z", ends_at: "2026-10-12T09:00:00.000Z" }; // 10/10 09:00 ~ 10/12 18:00 KST
    expect(dDay(exam, Date.parse("2026-10-07T15:30:00Z")).label).toBe("D-2"); // 10/8 00:30 KST
    expect(dDay(exam, Date.parse("2026-10-09T23:00:00Z")).label).toBe("D-day"); // 10/10 08:00 KST
    expect(dDay(exam, Date.parse("2026-10-10T01:00:00Z"))).toEqual({ label: "진행 중 · 마감 D-2", phase: "running" });
    expect(dDay(exam, Date.parse("2026-10-12T08:00:00Z")).label).toBe("진행 중 · 오늘 마감");
    expect(dDay(exam, Date.parse("2026-10-12T09:00:00Z"))).toEqual({ label: "마감", phase: "ended" });
  });
});

describe("candidate rows", () => {
  const H = ["사번*", "이름*", "이메일", "휴대폰", "소속", "기수", "입사일"];

  it("maps Korean and English headers, ignoring unknown ones", () => {
    expect(mapHeaders(["사원번호", "성명", "E-mail", "연락처", "부서", "비고"])).toEqual(["employee_no", "name", "email", "phone", "department", null]);
  });

  it("normalizes phone numbers and dates", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("011-123-4567")).toBe("011-123-4567");
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizeDate("2026.9.1")).toBe("2026-09-01");
    expect(normalizeDate("2026-02-30")).toBeNull();
  });

  it("reports missing columns, row errors, duplicates, and skips blank rows", () => {
    expect(parseCandidateRows(["이름"], [["홍길동"]]).missingColumns).toEqual(["사번"]);
    const r = parseCandidateRows(H, [
      ["A1", "홍길동", "a@b.co", "01012345678", "인사팀", "2026-하반기", "2026-09-01"],
      ["", "", "", "", "", "", ""],
      ["A2", "", "not-email", "123", "", "", "2026/13/01"],
      ["A1", "김철수", "", "", "", "", ""],
      ["A3", "이영희", "", "", "", "", ""],
    ]);
    expect(r.valid.map((v) => [v.row, v.employee_no, v.phone])).toEqual([[2, "A1", "010-1234-5678"], [6, "A3", null]]);
    expect(r.errors).toEqual([
      { row: 4, messages: ["이름이 없습니다", "이메일 형식이 아닙니다", "휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)", "입사일 형식이 아닙니다 (예: 2026-09-01)"] },
      { row: 5, messages: ["2행과 사번이 같습니다"] },
    ]);
  });

  it("re-validates confirmed rows on the server", () => {
    expect(revalidate([{ employee_no: "A1", name: "홍길동", phone: "010-1234-5678" }])).toEqual([
      { employee_no: "A1", name: "홍길동", email: null, phone: "010-1234-5678", department: null, cohort: null, joined_at: null },
    ]);
    expect(revalidate([{ employee_no: "A1" }])).toBeNull(); // 이름 없음
    expect(revalidate([{ employee_no: "A1", name: "a" }, { employee_no: "A1", name: "b" }])).toBeNull(); // 중복
    expect(revalidate("x")).toBeNull();
  });

  it("reads back the generated template", async () => {
    const buf = await buildTemplate();
    const sheet = await readSheet(new Uint8Array(buf).buffer);
    const parsed = parseCandidateRows(sheet.headers, sheet.rows);
    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.valid).toHaveLength(1); // 예시 행
    expect(parsed.valid[0]).toMatchObject({ employee_no: "N-2026-001", name: "홍길동", phone: "010-1234-5678", joined_at: "2026-09-01" });
  });

  it("reads numbers and dates typed into cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["사번", "이름", "입사일"]);
    ws.addRow([20261, "홍길동", new Date(Date.UTC(2026, 8, 1))]);
    const sheet = await readSheet(new Uint8Array(await wb.xlsx.writeBuffer()).buffer);
    expect(parseCandidateRows(sheet.headers, sheet.rows).valid[0]).toMatchObject({ employee_no: "20261", joined_at: "2026-09-01" });
  });
});

describe("notices", () => {
  const vars = noticeVars({ name: "홍길동", title: "AI 시험", starts_at: "2026-10-07T00:00:00Z", ends_at: "2026-10-14T09:00:00Z", time_limit_min: 40, url: "https://x/t/abc" });

  it("replaces known variables and reports unknown ones", () => {
    const r = renderTemplate("$이름$ 님 · $시험명$ · $제한 시간$분 · $응시 URL$ · $사번$", vars);
    expect(r.text).toBe("홍길동 님 · AI 시험 · 40분 · https://x/t/abc · $사번$");
    expect(r.unknown).toEqual(["$사번$"]);
    expect(vars["$응시 기한$"]).toContain("2026");
  });

  it("counts SMS bytes exactly (Korean 2, ASCII 1)", () => {
    expect(smsBytes("가")).toBe(2);
    expect(smsBytes("A1 ")).toBe(3);
    expect(smsBytes("홍길동 님\nOK")).toBe(2 * 4 + 1 + 1 + 2); // 홍길동님(4자) 공백 줄바꿈 OK
    expect(smsKind(90)).toBe("SMS");
    expect(smsKind(91)).toBe("LMS");
    expect(smsKind(2001)).toBe("초과");
  });

  it("escapes CSV cells", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe("");
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`); // 수식 주입 방지
    expect(csvCell("+82")).toBe("'+82");
    expect(csvCell("010-1234-5678")).toBe("010-1234-5678");
  });
});

// ── 서비스 규칙 (메모리 저장소) ────────────────────────────
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("next/server", () => ({ after: () => {} })); // 제출 뒤 채점 예약은 이 테스트에서 실행하지 않는다

describe("exam service", () => {
  beforeEach(() => {
    vi.stubEnv("EXAM_STORE", "memory");
    (globalThis as { __examStore?: unknown }).__examStore = createMemoryStore(demoDb());
  });

  it("creates a draft exam, imports candidates, and opens only when ready", async () => {
    const svc = await import("../service");
    const { getStore } = await import("../../attempt/store");
    const created = await svc.createExam({ title: "새 시험", starts: "2026-10-07T09:00", ends: "2099-10-14T18:00" }, null);
    expect(created.ok).toBe(true);
    const examId = (created as { value: string }).value;
    expect((await getStore().getExam(examId))?.status).toBe("draft");

    expect((await svc.setStatus(examId, "open")).ok).toBe(false); // 대상자·안내문 없음

    const first = await svc.importCandidates(examId, [{ employee_no: "A1", name: "홍길동" }, { employee_no: "A2", name: "김철수" }]);
    expect(first).toEqual({ ok: true, value: { inserted: 2, updated: 0 } });
    const tokenBefore = (await getStore().listCandidates(examId)).find((c) => c.employee_no === "A1")!.access_token;
    const second = await svc.importCandidates(examId, [{ employee_no: "A1", name: "홍길동", department: "인사팀" }]);
    expect(second).toEqual({ ok: true, value: { inserted: 0, updated: 1 } });
    const a1 = (await getStore().listCandidates(examId)).find((c) => c.employee_no === "A1")!;
    expect(a1).toMatchObject({ department: "인사팀", access_token: tokenBefore }); // 링크 유지

    expect((await svc.saveNotice(examId, "sms", "", "가".repeat(1001))).ok).toBe(false); // 2002바이트
    expect((await svc.saveNotice(examId, "email", "", "본문")).ok).toBe(false); // 제목 없음
    expect(await svc.saveNotice(examId, "email", "제목", "$이름$ 님")).toEqual({ ok: true });
    expect(await svc.saveNotice(examId, "sms", "", "첫 줄\r\n둘째 줄")).toEqual({ ok: true });
    expect((await getStore().getNotices(examId)).find((n) => n.channel === "sms")?.body).toBe("첫 줄\n둘째 줄"); // 줄바꿈 통일
    expect(await svc.setStatus(examId, "open")).toEqual({ ok: true });
  });

  it("protects candidates and time limits once an attempt has started", async () => {
    const svc = await import("../service");
    const { getStore } = await import("../../attempt/store");
    const store = getStore() as ReturnType<typeof createMemoryStore>;
    const demo = (await store.listCandidates("demo-exam"))[0];
    await store.startAttempt(demo.id);
    expect(await svc.removeCandidate("demo-exam", demo.id)).toMatchObject({ ok: false });
    expect((await svc.updateSite("demo-exam", { time_limit_min: "60", intro_text: "x", show_result: "on" })).ok).toBe(false);
    expect((await svc.updateSite("demo-exam", { time_limit_min: "40", intro_text: "바뀐 안내", show_result: "on" })).ok).toBe(true);
    const other = (await store.listCandidates("demo-exam"))[1];
    expect(await svc.removeCandidate("demo-exam", other.id)).toEqual({ ok: true });
  });
});

describe("retake", () => {
  const H = 3600_000;
  const kst = (t: number) => isoToKstInput(new Date(t).toISOString());
  let store: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    vi.stubEnv("EXAM_STORE", "memory");
    store = createMemoryStore(demoDb(Date.now(), { simulated: 5 }));
    (globalThis as { __examStore?: unknown }).__examStore = store;
  });

  it("extends the exam window only for a candidate with a later retake deadline", async () => {
    const { examForCandidate } = await import("../../attempt/timing");
    const exam = store.db.exams[0];
    expect(examForCandidate(exam, null)).toBe(exam);
    expect(examForCandidate(exam, "2000-01-01T00:00:00Z")).toBe(exam); // 시험 기간보다 이르면 무시
    const later = new Date(Date.parse(exam.ends_at) + 24 * H).toISOString();
    expect(examForCandidate(exam, later).ends_at).toBe(later);
  });

  it("requires a reason and an existing attempt", async () => {
    const svc = await import("../service");
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "  " }, null)).toMatchObject({ ok: false, fields: { reason: expect.any(String) } });
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "가".repeat(501) }, null)).toMatchObject({ ok: false, fields: { reason: expect.any(String) } });
    expect(await svc.grantRetake("demo-exam", "demo-c2", { reason: "오류" }, null)).toMatchObject({ ok: false }); // 아직 응시 안 함
    expect(await svc.grantRetake("demo-exam", "nobody", { reason: "오류" }, null)).toMatchObject({ ok: false });
    store.db.exams[0].status = "closed";
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류" }, null)).toMatchObject({ ok: false }); // 시험이 닫힘
  });

  it("archives the previous attempt with its gradings and lets the candidate start over", async () => {
    const svc = await import("../service");
    const before = store.db.attempts.find((a) => a.candidate_id === "sim-c1")!;
    const grade = store.db.results.get(before.id)!.grade;
    expect((await store.getCohort("demo-exam")).length).toBe(5);

    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: " 화면 멈춤\r\n서술형 미저장 " }, "admin-1")).toEqual({ ok: true });

    const archive = store.db.archives[0];
    expect(archive).toMatchObject({ candidate_id: "sim-c1", attempt_id: before.id, status: "complete", grade, reason: "화면 멈춤\n서술형 미저장", archived_by: "admin-1", scores_cleared_at: null });
    expect(archive.snapshot.responses.filter((r) => r.final_grading)).toHaveLength(3); // 확정 점수까지 보관
    expect(archive.snapshot.result).toMatchObject({ status: "complete", grade });
    expect(store.db.attempts.some((a) => a.candidate_id === "sim-c1")).toBe(false);
    expect(store.db.results.has(before.id)).toBe(false);
    expect((await store.getCohort("demo-exam")).length).toBe(4); // 이전 결과는 동기 비교에서 빠진다

    const c = (await store.listCandidates("demo-exam")).find((x) => x.id === "sim-c1")!;
    expect(c).toMatchObject({ attemptStatus: null, retake_until: null, retakes: [{ status: "complete", grade, reason: "화면 멈춤\n서술형 미저장" }] });
    expect(await svc.removeCandidate("demo-exam", "sim-c1")).toMatchObject({ ok: false }); // 기록이 남아 있으면 삭제 불가

    // 같은 링크로 처음부터 다시 응시
    const attempt = await import("../../attempt/service");
    expect(await attempt.loadSession("sim-1")).toMatchObject({ state: "intro" });
    expect(await attempt.startAttempt("sim-1")).toEqual({ ok: true });
    expect(await attempt.loadSession("sim-1")).toMatchObject({ state: "in-progress", responses: [] });
  });

  it("clears archived scores only after the retake is complete, keeping answers and the reason", async () => {
    const svc = await import("../service");
    await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류" }, null);
    const archiveId = store.db.archives[0].id;
    expect(await svc.clearRetakeScores("demo-exam", "sim-c1", archiveId)).toMatchObject({ ok: false }); // 재응시 전

    await store.startAttempt("sim-c1");
    const retake = store.db.attempts.find((a) => a.candidate_id === "sim-c1")!;
    retake.status = "grading";
    expect(await svc.clearRetakeScores("demo-exam", "sim-c1", archiveId)).toMatchObject({ ok: false }); // 아직 확정 전
    retake.status = "complete";
    expect(await svc.clearRetakeScores("demo-exam", "sim-c2", archiveId)).toMatchObject({ ok: false }); // 다른 대상자
    expect(await svc.clearRetakeScores("demo-exam", "sim-c1", archiveId)).toEqual({ ok: true });

    const archive = store.db.archives[0];
    expect(archive.grade).toBeNull();
    expect(archive.scores_cleared_at).not.toBeNull();
    expect(archive.snapshot.result).toBeNull();
    expect(archive.snapshot.responses.length).toBeGreaterThan(0); // 응답 원문은 남김
    expect(archive.snapshot.responses.some((r) => "final_grading" in r || "ai_gradings" in r)).toBe(false);
    expect(archive.reason).toBe("오류");
    expect(await svc.clearRetakeScores("demo-exam", "sim-c1", archiveId)).toMatchObject({ ok: false }); // 이미 지움
  });

  it("asks for a per-candidate deadline when too little exam time is left", async () => {
    const svc = await import("../service");
    const now = Date.now();
    const exam = store.db.exams[0];

    exam.ends_at = new Date(now + 10 * 60_000).toISOString(); // 10분 남음 < 제한 시간 40분
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류" }, null, now)).toMatchObject({ ok: false, fields: { until: expect.stringContaining("40분") } });

    exam.ends_at = new Date(now - H).toISOString(); // 기간 끝남
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류" }, null, now)).toMatchObject({ ok: false, fields: { until: expect.stringContaining("끝났습니다") } });
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류", until: kst(now - 2 * H) }, null, now)).toMatchObject({ ok: false, fields: { until: expect.any(String) } });
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류", until: "잘못된 값" }, null, now)).toMatchObject({ ok: false, fields: { until: expect.any(String) } });

    const until = kst(now + 48 * H);
    expect(await svc.grantRetake("demo-exam", "sim-c1", { reason: "오류", until }, null, now)).toEqual({ ok: true });
    expect(isoToKstInput(store.db.candidates.find((c) => c.id === "sim-c1")!.retake_until!)).toBe(until);

    // 이 대상자만 응시할 수 있다
    const attempt = await import("../../attempt/service");
    expect(await attempt.loadSession("sim-1")).toMatchObject({ state: "intro" });
    expect(await attempt.loadSession("demo2")).toMatchObject({ state: "unavailable", reason: "ended" });
  });
});
