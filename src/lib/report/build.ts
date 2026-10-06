// 개인 리포트 화면용 계산 (순수 함수): 동기 내 상위 %, 점수 분포 히스토그램.

import type { CohortMember } from "../attempt/types";
import { topPercent, type ExamResult } from "../exam/scoring";

/** 비교 인원이 이보다 적으면 상위 % 와 분포를 보여 주지 않는다 (개인 식별·과해석 방지) */
export const MIN_COHORT = 5;
export const BIN_WIDTH = 10;

export interface Histogram {
  bins: number[]; // 0~10, 10~20, ..., 90~100 (마지막 구간은 100 포함)
  mine: number; // 내 점수가 속한 구간 번호
}

export function binOf(score: number): number {
  return Math.min(Math.floor(score / BIN_WIDTH), 100 / BIN_WIDTH - 1);
}

export function histogram(values: number[], mine: number): Histogram {
  const bins = Array.from({ length: 100 / BIN_WIDTH }, () => 0);
  for (const v of values) bins[binOf(v)]++;
  return { bins, mine: binOf(mine) };
}

export interface CohortView {
  size: number;
  topPercent: number;
  total: Histogram;
  tops: Record<string, Histogram>;
}

/** 확정된 결과와 같은 시험 동기들의 결과로 비교 정보를 만든다. 인원이 적으면 null */
export function cohortView(result: ExamResult, attemptId: string, cohort: CohortMember[]): CohortView | null {
  if (result.status !== "complete" || result.total == null) return null;
  // 본인이 목록에 없으면(방금 확정된 경우 등) 넣어서 계산한다
  const members = cohort.some((m) => m.attemptId === attemptId)
    ? cohort
    : [...cohort, { attemptId, total: result.total, knowledge: result.knowledge, practice: result.practice ?? 0, tops: {} }];
  if (members.length < MIN_COHORT) return null;

  const tops: Record<string, Histogram> = {};
  for (const t of result.tops) {
    if (t.score == null) continue;
    const values = members.map((m) => (m.attemptId === attemptId ? t.score! : m.tops[t.id])).filter((v): v is number => v != null);
    tops[t.id] = histogram(values, t.score);
  }
  return {
    size: members.length,
    topPercent: topPercent(result.total, members.map((m) => m.total)),
    total: histogram(members.map((m) => m.total), result.total),
    tops,
  };
}
