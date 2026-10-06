import type { AttemptStatus } from "../attempt/types";

export const STATUS_LABELS: Record<AttemptStatus, string> = {
  in_progress: "응시 중",
  submitted: "AI 채점 대기",
  grading: "검토 대기",
  complete: "채점 완료",
};

export const STATUS_STYLES: Record<AttemptStatus, string> = {
  in_progress: "bg-zinc-100 text-zinc-600",
  submitted: "bg-amber-50 text-amber-700",
  grading: "bg-blue-50 text-blue-700",
  complete: "bg-emerald-50 text-emerald-700",
};

export const RELIABILITY_STYLES = { reliable: "text-emerald-700", caution: "text-amber-700", unreliable: "text-red-600" } as const;
