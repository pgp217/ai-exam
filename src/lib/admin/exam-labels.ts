import type { ExamRow } from "../attempt/types";

export const EXAM_STATUS_LABELS: Record<ExamRow["status"], string> = { draft: "초안", open: "진행", closed: "마감" };
export const EXAM_STATUS_STYLES: Record<ExamRow["status"], string> = {
  draft: "bg-zinc-100 text-zinc-600",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900",
};
