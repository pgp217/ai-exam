// 응시 흐름 (서버 전용). 페이지와 API Route 가 함께 쓴다.
import "server-only";

import { ANSWER_KEY } from "../exam/answer-key";
import { createMemoryStore } from "./memory-store";
import { mergeResponses, parseResponses, scoreSubmission } from "./responses";
import { createSupabaseStore } from "./supabase-store";
import { acceptsAnswers, attemptDeadline, durationSec, examWindow, type ExamWindow } from "./timing";
import type { ExamRow, ExamStore, ResponseRow, Session } from "./types";

// ── 저장소 선택 ─────────────────────────────────────────
// EXAM_STORE=memory | supabase. 지정하지 않으면 Supabase 서버 키가 있을 때 supabase, 없으면 memory(개발 전용).
const g = globalThis as unknown as { __examStore?: ExamStore };

export function storeMode(): "memory" | "supabase" {
  const explicit = process.env.EXAM_STORE;
  if (explicit === "memory" || explicit === "supabase") return explicit;
  if (supabaseUrl() && supabaseKey()) return "supabase";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase 설정이 없습니다. SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 지정하세요.");
  }
  return "memory";
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

export function getStore(): ExamStore {
  if (g.__examStore) return g.__examStore;
  if (storeMode() === "memory") {
    // 개발 서버의 HMR 에서도 데이터가 유지되도록 전역에 둔다
    return (g.__examStore = createMemoryStore());
  }
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error("EXAM_STORE=supabase 인데 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  return (g.__examStore = createSupabaseStore(url, key));
}

// ── 화면 상태 ───────────────────────────────────────────
export type PublicExam = Pick<ExamRow, "title" | "intro_text" | "time_limit_min" | "starts_at" | "ends_at" | "show_result">;

export type SessionView =
  | { state: "not-found" }
  | { state: "unavailable"; reason: Exclude<ExamWindow, "open">; exam: PublicExam; candidateName: string }
  | { state: "intro"; exam: PublicExam; candidateName: string }
  | { state: "in-progress"; exam: PublicExam; candidateName: string; deadline: number; now: number; responses: ResponseRow[] }
  | { state: "submitted"; exam: PublicExam; candidateName: string; submittedAt: string | null };

function publicExam(e: ExamRow): PublicExam {
  return { title: e.title, intro_text: e.intro_text, time_limit_min: e.time_limit_min, starts_at: e.starts_at, ends_at: e.ends_at, show_result: e.show_result };
}

/** 응시 링크로 들어왔을 때의 화면 상태. 마감이 지난 응시는 저장된 응답으로 제출 처리한다. */
export async function loadSession(token: string): Promise<SessionView> {
  const store = getStore();
  let s = await store.findSession(token);
  if (!s) return { state: "not-found" };

  const now = Date.now();
  if (s.attempt?.status === "in_progress" && !acceptsAnswers(s.exam, s.attempt, now)) {
    await finalize(store, s, [], now);
    s = (await store.findSession(token))!;
  }

  const base = { exam: publicExam(s.exam), candidateName: s.candidate.name };
  const a = s.attempt;
  if (a && a.status !== "in_progress") return { state: "submitted", ...base, submittedAt: a.submitted_at };
  if (a) return { state: "in-progress", ...base, deadline: attemptDeadline(s.exam, a), now, responses: s.responses };

  const w = examWindow(s.exam, now);
  if (w !== "open") return { state: "unavailable", reason: w, ...base };
  return { state: "intro", ...base };
}

// ── API 동작 ───────────────────────────────────────────
export type ActionResult = { ok: true } | { ok: false; status: number; error: string };

const err = (status: number, error: string): ActionResult => ({ ok: false, status, error });

export async function startAttempt(token: string): Promise<ActionResult> {
  const store = getStore();
  const s = await store.findSession(token);
  if (!s) return err(404, "응시 링크가 올바르지 않습니다.");
  if (s.attempt) return { ok: true }; // 이미 시작함
  if (examWindow(s.exam, Date.now()) !== "open") return err(409, "지금은 응시할 수 없습니다.");
  await store.startAttempt(s.candidate.id);
  return { ok: true };
}

export async function saveResponses(token: string, body: unknown): Promise<ActionResult> {
  const parsed = parse(body);
  if (!Array.isArray(parsed)) return parsed;

  const store = getStore();
  const s = await store.findSession(token);
  if (!s?.attempt) return err(404, "진행 중인 응시가 없습니다.");
  if (!acceptsAnswers(s.exam, s.attempt, Date.now())) return err(409, "응시 시간이 끝났거나 이미 제출했습니다.");
  if (!(await store.saveResponses(s.attempt.id, parsed))) return err(409, "이미 제출했습니다.");
  return { ok: true };
}

export async function submitAttempt(token: string, body: unknown): Promise<ActionResult> {
  const parsed = parse(body);
  if (!Array.isArray(parsed)) return parsed;

  const store = getStore();
  const s = await store.findSession(token);
  if (!s?.attempt) return err(404, "진행 중인 응시가 없습니다.");
  if (s.attempt.status !== "in_progress") return { ok: true }; // 중복 제출은 무시

  const now = Date.now();
  // 마감 + 여유 시간이 지났으면 이번 요청의 응답은 받지 않고 저장된 응답으로 제출한다
  await finalize(store, s, acceptsAnswers(s.exam, s.attempt, now) ? parsed : [], now);
  return { ok: true };
}

function parse(body: unknown): ResponseRow[] | ActionResult {
  try {
    return parseResponses((body as { responses?: unknown } | null)?.responses ?? []);
  } catch (e) {
    return err(400, e instanceof Error ? e.message : "invalid request");
  }
}

async function finalize(store: ExamStore, s: Session, incoming: ResponseRow[], now: number) {
  const attempt = s.attempt!;
  const all = mergeResponses(s.responses, incoming);
  const { knowledge, detail, reliability } = scoreSubmission(all, ANSWER_KEY);
  await store.submitAttempt({
    attemptId: attempt.id,
    responses: incoming,
    durationSec: durationSec(s.exam, attempt, now),
    reliability,
    knowledgeScore: knowledge,
    detail,
  });
}
