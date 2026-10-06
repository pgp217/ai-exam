// 리포트 화면 데이터 (서버 전용)
import "server-only";

import { getStore } from "../attempt/store";
import type { Feedback, ReportData } from "../attempt/types";
import type { ExamResult } from "../exam/scoring";
import { cohortView, type CohortView } from "./build";

export interface LoadedReport {
  report: ReportData;
  result: ExamResult | null; // 결과가 확정되지 않았으면 null
  cohort: CohortView | null;
  feedback: Feedback | null;
}

export async function loadReport(attemptId: string): Promise<LoadedReport | null> {
  const store = getStore();
  const report = await store.getReport(attemptId);
  if (!report) return null;
  if (report.result?.status !== "complete") return { report, result: null, cohort: null, feedback: null };
  const result = report.result.detail as ExamResult;
  const cohort = cohortView(result, attemptId, await store.getCohort(report.exam.id));
  return { report, result, cohort, feedback: report.result.feedback };
}
