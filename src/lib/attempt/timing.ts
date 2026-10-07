// 응시 가능 시간 판정 (순수 함수)

import type { AttemptRow, ExamRow } from "./types";

/** 제한 시간이 끝난 뒤에도 마지막 저장·제출 요청을 받아 주는 여유 (네트워크 지연 대비) */
export const GRACE_MS = 60_000;

/**
 * 대상자에게 재응시 마감(retake_until)이 있으면 그 대상자에게만 응시 기간 종료를 늦춘다.
 * 시험 기간보다 이르면 무시한다. 이후 판정은 모두 이 값을 쓴다.
 */
export function examForCandidate(exam: ExamRow, retakeUntil: string | null): ExamRow {
  if (!retakeUntil || Date.parse(retakeUntil) <= Date.parse(exam.ends_at)) return exam;
  return { ...exam, ends_at: retakeUntil };
}

export type ExamWindow = "open" | "not-yet" | "ended" | "closed";

export function examWindow(exam: ExamRow, now: number): ExamWindow {
  if (exam.status !== "open") return "closed";
  if (now < Date.parse(exam.starts_at)) return "not-yet";
  if (now >= Date.parse(exam.ends_at)) return "ended";
  return "open";
}

/** 시작 시각 + 제한 시간과 응시 기간 종료 중 이른 시각 */
export function attemptDeadline(exam: ExamRow, attempt: AttemptRow): number {
  return Math.min(Date.parse(attempt.started_at) + exam.time_limit_min * 60_000, Date.parse(exam.ends_at));
}

/** 응답을 더 받을 수 있는지. 시험이 닫혔거나 마감 + 여유 시간이 지나면 false */
export function acceptsAnswers(exam: ExamRow, attempt: AttemptRow, now: number): boolean {
  return attempt.status === "in_progress" && exam.status === "open" && now <= attemptDeadline(exam, attempt) + GRACE_MS;
}

/** 실제 응시 시간(초). 마감 시각을 넘지 않는다. */
export function durationSec(exam: ExamRow, attempt: AttemptRow, now: number): number {
  const end = Math.min(now, attemptDeadline(exam, attempt));
  return Math.max(0, Math.round((end - Date.parse(attempt.started_at)) / 1000));
}
