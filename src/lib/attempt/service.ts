// 응시 흐름 (서버 전용). 페이지와 API Route 가 함께 쓴다.
import "server-only";

import { ANSWER_KEY } from "../exam/answer-key";
import { scheduleGrading } from "../grading/service";
import { mergeResponses, missingEssayRows, parseResponses, scoreSubmission } from "./responses";
import { InvalidSurveyError, parseSurvey, type Survey } from "../survey/survey";
import { getStore } from "./store";
import { acceptsAnswers, attemptDeadline, durationSec, examForCandidate, examWindow, type ExamWindow } from "./timing";
import type { ExamRow, ExamStore, ResponseRow, Session } from "./types";

/** 응시 링크로 세션을 찾는다. 재응시 마감이 있으면 그 대상자의 응시 기간에 반영한다 */
async function findSession(store: ExamStore, token: string): Promise<Session | null> {
  const s = await store.findSession(token);
  return s && { ...s, exam: examForCandidate(s.exam, s.candidate.retake_until) };
}

export { storeMode } from "./store";

// ── 화면 상태 ───────────────────────────────────────────
export type PublicExam = Pick<ExamRow, "title" | "intro_text" | "time_limit_min" | "starts_at" | "ends_at" | "show_result">;

export type SessionView =
  | { state: "not-found" }
  | { state: "unavailable"; reason: Exclude<ExamWindow, "open">; exam: PublicExam; candidateName: string }
  | { state: "intro"; exam: PublicExam; candidateName: string }
  | { state: "in-progress"; exam: PublicExam; candidateName: string; deadline: number; now: number; responses: ResponseRow[] }
  | { state: "submitted"; exam: PublicExam; candidateName: string; submittedAt: string | null; attemptId: string; survey: SurveyState };

/** 응시 후 설문: 받지 않는 시험(off), 아직 안 냄(ask), 냄(done) */
export type SurveyState = "off" | "ask" | "done";

const surveyState = (s: Session): SurveyState => (!s.exam.collect_survey ? "off" : s.surveyDone ? "done" : "ask");

function publicExam(e: ExamRow): PublicExam {
  return { title: e.title, intro_text: e.intro_text, time_limit_min: e.time_limit_min, starts_at: e.starts_at, ends_at: e.ends_at, show_result: e.show_result };
}

/** 응시 링크로 들어왔을 때의 화면 상태. 마감이 지난 응시는 저장된 응답으로 제출 처리한다. */
export async function loadSession(token: string): Promise<SessionView> {
  const store = getStore();
  const s = await findSession(store, token);
  if (!s) return { state: "not-found" };

  const now = Date.now();
  const base = { exam: publicExam(s.exam), candidateName: s.candidate.name };
  const a = s.attempt;

  if (a?.status === "in_progress" && !acceptsAnswers(s.exam, a, now)) {
    // 여기서 다시 조회하지 않는다. 렌더링 중 같은 GET fetch 는 Next.js 가 메모이즈해 제출 전 상태가 돌아온다.
    await finalize(store, s, [], now);
    return { state: "submitted", ...base, submittedAt: new Date(now).toISOString(), attemptId: a.id, survey: surveyState(s) };
  }

  if (a && a.status !== "in_progress") return { state: "submitted", ...base, submittedAt: a.submitted_at, attemptId: a.id, survey: surveyState(s) };
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
  const s = await findSession(store, token);
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
  const s = await findSession(store, token);
  if (!s?.attempt) return err(404, "진행 중인 응시가 없습니다.");
  if (!acceptsAnswers(s.exam, s.attempt, Date.now())) return err(409, "응시 시간이 끝났거나 이미 제출했습니다.");
  if (!(await store.saveResponses(s.attempt.id, parsed))) return err(409, "이미 제출했습니다.");
  return { ok: true };
}

export async function submitAttempt(token: string, body: unknown): Promise<ActionResult> {
  const parsed = parse(body);
  if (!Array.isArray(parsed)) return parsed;

  const store = getStore();
  const s = await findSession(store, token);
  if (!s?.attempt) return err(404, "진행 중인 응시가 없습니다.");
  if (s.attempt.status !== "in_progress") return { ok: true }; // 중복 제출은 무시

  const now = Date.now();
  // 마감 + 여유 시간이 지났으면 이번 요청의 응답은 받지 않고 저장된 응답으로 제출한다
  await finalize(store, s, acceptsAnswers(s.exam, s.attempt, now) ? parsed : [], now);
  return { ok: true };
}

/** 응시 후 설문 저장. 제출한 응시에만, 1번만 받는다 */
export async function submitSurvey(token: string, body: unknown): Promise<ActionResult> {
  let survey: Survey;
  try {
    survey = parseSurvey(body);
  } catch (e) {
    return err(400, e instanceof InvalidSurveyError ? e.message : "설문 형식이 올바르지 않습니다.");
  }
  const store = getStore();
  const s = await findSession(store, token);
  if (!s) return err(404, "응시 링크가 올바르지 않습니다.");
  if (!s.exam.collect_survey) return err(404, "설문을 받지 않는 시험입니다.");
  if (!s.attempt || s.attempt.status === "in_progress") return err(409, "답안을 제출한 뒤에 설문에 답할 수 있습니다.");
  if (!(await store.saveSurvey(s.attempt.id, survey))) return err(409, "이미 설문에 답했습니다.");
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
  // 답하지 않은 서술형도 빈 답안으로 저장해 채점·확정 대상이 되게 한다
  const rows = [...incoming, ...missingEssayRows(mergeResponses(s.responses, incoming))];
  const all = mergeResponses(s.responses, rows);
  const { knowledge, detail, reliability } = scoreSubmission(all, ANSWER_KEY);
  const submitted = await store.submitAttempt({
    attemptId: attempt.id,
    responses: rows,
    durationSec: durationSec(s.exam, attempt, now),
    reliability,
    knowledgeScore: knowledge,
    detail,
  });
  // 응답을 보낸 뒤 서술형 AI 1차 채점을 시작한다 (실패하면 관리자 화면에서 다시 실행)
  if (submitted) scheduleGrading(attempt.id);
}
