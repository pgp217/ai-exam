// 시험 생성 마법사·대상자·안내문 (서버 전용). 호출하는 쪽(Server Action)에서 requireAdmin() 을 먼저 확인한다.
import "server-only";

import { headers } from "next/headers";
import { getStore } from "../attempt/store";
import type { ExamRow, NoticeTemplate } from "../attempt/types";
import { ITEM_SET_VERSION } from "../exam/items";
import { MAX_ROWS, parseCandidateRows, revalidate, type CandidateInput, type ParsedCandidates } from "./candidates";
import { parseBasic, parseSite, type FieldErrors } from "./form";
import { LMS_LIMIT, smsBytes, type Channel } from "./notice";
import { MAX_FILE_BYTES, readSheet } from "./xlsx";

export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; error: string; fields?: FieldErrors };

export const DEFAULT_INTRO = "genai-book 교재 Ch 1~11 내용을 바탕으로 생성형 AI 활용 역량을 확인합니다.";

/** 응시 링크에 쓸 앱 주소. APP_URL 이 있으면 그 값, 없으면 요청 헤더에서 만든다 */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const examLink = (origin: string, token: string) => `${origin}/t/${token}`;

// ── 기본 설정 · 응시 사이트 ──────────────────────────────

export async function createExam(form: { title?: string; starts?: string; ends?: string }, adminId: string | null): Promise<Result<string>> {
  const basic = parseBasic(form);
  if (!basic.ok) return { ok: false, error: "입력값을 확인해 주세요.", fields: basic.errors };
  const id = await getStore().createExam(
    { ...basic.value, time_limit_min: 40, intro_text: DEFAULT_INTRO, show_result: true, item_set_version: ITEM_SET_VERSION },
    adminId,
  );
  return { ok: true, value: id };
}

export async function updateBasic(examId: string, form: { title?: string; starts?: string; ends?: string }): Promise<Result> {
  const basic = parseBasic(form);
  if (!basic.ok) return { ok: false, error: "입력값을 확인해 주세요.", fields: basic.errors };
  if (!(await getStore().getExam(examId))) return { ok: false, error: "시험을 찾을 수 없습니다." };
  await getStore().updateExam(examId, basic.value);
  return { ok: true };
}

export async function updateSite(examId: string, form: { time_limit_min?: string; intro_text?: string; show_result?: string | null }): Promise<Result> {
  const site = parseSite(form);
  if (!site.ok) return { ok: false, error: "입력값을 확인해 주세요.", fields: site.errors };
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) return { ok: false, error: "시험을 찾을 수 없습니다." };
  // 응시를 시작한 사람이 있으면 제한 시간을 바꾸지 않는다 (진행 중인 응시의 마감 시각이 바뀌므로)
  if (site.value.time_limit_min !== exam.time_limit_min) {
    const started = (await store.listCandidates(examId)).some((c) => c.attemptStatus);
    if (started) return { ok: false, error: "응시를 시작한 사람이 있어 제한 시간은 바꿀 수 없습니다.", fields: { time_limit_min: "응시가 시작된 시험입니다." } };
  }
  await store.updateExam(examId, site.value);
  return { ok: true };
}

/** 시험 열기 전에 확인할 항목. 비어 있으면 열 수 있다 */
export async function openBlockers(exam: ExamRow, now = Date.now()): Promise<string[]> {
  const store = getStore();
  const [candidates, notices] = await Promise.all([store.listCandidates(exam.id), store.getNotices(exam.id)]);
  const blockers: string[] = [];
  if (candidates.length === 0) blockers.push("대상자를 1명 이상 등록해 주세요.");
  if (Date.parse(exam.ends_at) <= now) blockers.push("응시 마감 일시가 이미 지났습니다. 기본 설정에서 기간을 바꿔 주세요.");
  if (notices.length === 0) blockers.push("안내문(메일 또는 문자)을 하나 이상 저장해 주세요.");
  return blockers;
}

export async function setStatus(examId: string, status: ExamRow["status"]): Promise<Result> {
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) return { ok: false, error: "시험을 찾을 수 없습니다." };
  if (status === "open") {
    const blockers = await openBlockers(exam);
    if (blockers.length) return { ok: false, error: blockers.join(" ") };
  }
  await store.updateExam(examId, { status });
  return { ok: true };
}

// ── 대상자 ─────────────────────────────────────────────

export interface ImportPreview extends ParsedCandidates {
  existing: number; // 이미 등록된 사번 수 (확정하면 정보가 바뀜)
}

export async function previewCandidateFile(examId: string, file: File | null): Promise<Result<ImportPreview>> {
  if (!file || file.size === 0) return { ok: false, error: "엑셀 파일을 선택해 주세요." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "파일이 너무 큽니다 (최대 2MB)." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "엑셀(.xlsx) 파일만 올릴 수 있습니다. 양식을 내려받아 작성해 주세요." };
  let sheet: { headers: string[]; rows: string[][] };
  try {
    sheet = await readSheet(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "엑셀 파일을 읽지 못했습니다. 양식을 내려받아 다시 저장해 주세요." };
  }
  if (sheet.rows.length > MAX_ROWS) return { ok: false, error: `한 번에 최대 ${MAX_ROWS}명까지 올릴 수 있습니다.` };
  const parsed = parseCandidateRows(sheet.headers, sheet.rows);
  if (parsed.missingColumns.length) return { ok: false, error: `필수 열이 없습니다: ${parsed.missingColumns.join(", ")}. 양식의 머리글을 그대로 사용해 주세요.` };
  const existing = new Set((await getStore().listCandidates(examId)).map((c) => c.employee_no));
  return { ok: true, value: { ...parsed, existing: parsed.valid.filter((v) => existing.has(v.employee_no)).length } };
}

export async function importCandidates(examId: string, rows: unknown): Promise<Result<{ inserted: number; updated: number }>> {
  const valid = revalidate(rows);
  if (!valid) return { ok: false, error: "등록할 대상자 정보가 올바르지 않습니다. 파일을 다시 올려 주세요." };
  if (!(await getStore().getExam(examId))) return { ok: false, error: "시험을 찾을 수 없습니다." };
  return { ok: true, value: await getStore().upsertCandidates(examId, valid) };
}

export async function addCandidate(examId: string, input: Partial<Record<keyof CandidateInput, string>>): Promise<Result<{ inserted: number; updated: number }>> {
  const valid = revalidate([input]);
  if (!valid) {
    const parsed = parseCandidateRows(["사번", "이름", "이메일", "휴대폰", "소속", "기수", "입사일"], [[input.employee_no ?? "", input.name ?? "", input.email ?? "", input.phone ?? "", input.department ?? "", input.cohort ?? "", input.joined_at ?? ""]]);
    return { ok: false, error: parsed.errors[0]?.messages.join(", ") ?? "입력값을 확인해 주세요." };
  }
  return { ok: true, value: await getStore().upsertCandidates(examId, valid) };
}

export async function removeCandidate(examId: string, candidateId: string): Promise<Result> {
  return (await getStore().deleteCandidate(examId, candidateId)) ? { ok: true } : { ok: false, error: "응시 기록이 있는 대상자는 삭제할 수 없습니다." };
}

// ── 안내문 ─────────────────────────────────────────────

/** 폼으로 보낸 textarea 는 줄바꿈이 \r\n 이 된다. 저장값과 화면값·문자 바이트 계산이 같도록 \n 으로 맞춘다 */
export const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

export async function saveNotice(examId: string, channel: Channel, subject: string, body: string): Promise<Result> {
  const s = normalizeNewlines(subject).trim();
  const b = normalizeNewlines(body).trim();
  if (channel === "email" && !s) return { ok: false, error: "메일 제목을 입력해 주세요." };
  if (!b) return { ok: false, error: "본문을 입력해 주세요." };
  if (s.length > 200 || b.length > 5000) return { ok: false, error: "내용이 너무 깁니다." };
  if (channel === "sms" && smsBytes(b) > LMS_LIMIT) return { ok: false, error: `문자는 ${LMS_LIMIT}바이트(LMS) 이내로 써 주세요.` };
  const notice: NoticeTemplate = { channel, subject: channel === "email" ? s : null, body: b };
  await getStore().saveNotice(examId, notice);
  return { ok: true };
}
