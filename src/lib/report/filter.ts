// 관리자 결과 목록의 상태 구분과 필터 (순수 함수)

import type { ResultRow } from "../attempt/types";
import type { ReliabilityResult } from "../exam/reliability";

export type Stage = "not_started" | "in_progress" | "ai_pending" | "review" | "complete";

export const STAGE_LABELS: Record<Stage, string> = {
  not_started: "미응시",
  in_progress: "응시 중",
  ai_pending: "AI 채점 대기",
  review: "검토 대기",
  complete: "채점 완료",
};

export function stageOf(row: ResultRow): Stage {
  switch (row.attempt?.status) {
    case undefined:
      return "not_started";
    case "in_progress":
      return "in_progress";
    case "submitted":
      return "ai_pending";
    case "grading":
      return "review";
    case "complete":
      return "complete";
  }
}

export interface ResultFilters {
  exam?: string;
  q?: string; // 이름·사번
  dept?: string;
  cohort?: string;
  stage?: string;
  reliability?: string;
  grade?: string;
}

export function reliabilityOf(row: ResultRow): ReliabilityResult["level"] | null {
  return (row.attempt?.reliability as ReliabilityResult | null)?.level ?? null;
}

export function filterResults(rows: ResultRow[], f: ResultFilters): ResultRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.exam || r.exam.id === f.exam) &&
      (!q || r.candidate.name.toLowerCase().includes(q) || r.candidate.employee_no.toLowerCase().includes(q)) &&
      (!f.dept || r.candidate.department === f.dept) &&
      (!f.cohort || r.candidate.cohort === f.cohort) &&
      (!f.stage || stageOf(r) === f.stage) &&
      (!f.reliability || reliabilityOf(r) === f.reliability) &&
      (!f.grade || (r.result?.status === "complete" && r.result.grade === f.grade)),
  );
}

export function summarize(rows: ResultRow[]) {
  const complete = rows.filter((r) => r.result?.status === "complete" && r.result.total != null);
  const submitted = rows.filter((r) => r.attempt && r.attempt.status !== "in_progress").length;
  const avg = complete.length === 0 ? null : Math.round((complete.reduce((s, r) => s + (r.result!.total as number), 0) / complete.length) * 10) / 10;
  return { total: rows.length, submitted, complete: complete.length, avgTotal: avg };
}

/** 셀렉트 박스 선택지: 데이터에 있는 값만, 가나다순 */
export function distinct(rows: ResultRow[], pick: (r: ResultRow) => string | null | undefined): string[] {
  return [...new Set(rows.map(pick).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "ko"));
}
