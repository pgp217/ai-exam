// BI(Power BI 등) 내보내기: 채점이 끝난 응시를 집계하기 좋은 표 3개로 바꾼다 (순수 함수).
// 응시자 표(1인 1행) · 역량 점수 표(응시자 × 중위요인 8개, 세로형) · 역량 표(중위요인 8개, 차원 표).
// 이름·사번·연락처는 넣지 않는다. 응시자ID 는 대상자 id 의 해시라 표만으로는 누구인지 알 수 없다.

import { createHash } from "node:crypto";
import { MID_FACTORS, TOP_FACTORS } from "../exam/factors";
import type { ExamResult } from "../exam/scoring";
import { RELIABILITY_LABELS, type ReliabilityResult } from "../exam/reliability";
import { csvCell } from "../exams/notice";
import type { BiSourceRow } from "../attempt/types";

export type Cell = string | number | null;
export interface Table {
  columns: string[];
  rows: Cell[][];
}

export const BI_TABLES = {
  people: { label: "응시자", file: "응시자" },
  scores: { label: "역량 점수", file: "역량점수" },
  factors: { label: "역량", file: "역량" },
} as const;
export type BiTable = keyof typeof BI_TABLES;

/** 이 점수 미만이면 그 역량의 교육 대상으로 센다 (등급 B 의 하한) */
export const NEEDS_TRAINING_BELOW = 60;

const UNSET = "미지정";
const GAP_LABELS = { over: "과대평가", under: "과소평가" } as const;

export function pseudoId(candidateId: string): string {
  return "R-" + createHash("sha256").update(candidateId).digest("hex").slice(0, 8).toUpperCase();
}

const kstDate = (iso: string | null) =>
  iso == null ? null : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso)); // YYYY-MM-DD

const round1 = (x: number) => Math.round(x * 10) / 10;

/** 사번 앞부분이 exclude 중 하나와 같으면 뺀다 (예: P-000 리허설, SIM- 가상 응시자) */
export function excludeRows(rows: BiSourceRow[], exclude: string[]): BiSourceRow[] {
  return rows.filter((r) => !exclude.some((e) => r.employee_no.startsWith(e)));
}

export function buildPeople(rows: BiSourceRow[]): Table {
  const columns = [
    "응시자ID", "시험", "문항세트", "부서", "기수", "응시일", "응시시간_분", "응답신뢰도",
    "총점", "등급", "AI활용유형", "지식점수", "실무점수", ...TOP_FACTORS.map((t) => t.name), "약점1", "약점2",
  ];
  const out = rows.map((r) => {
    const d = r.detail as ExamResult;
    const rel = (r.reliability as ReliabilityResult | null)?.level;
    return [
      pseudoId(r.candidateId), r.exam.title, r.exam.item_set_version, r.department || UNSET, r.cohort || UNSET,
      kstDate(r.submittedAt), r.durationSec == null ? null : round1(r.durationSec / 60), rel ? RELIABILITY_LABELS[rel] : null,
      d.total, d.grade, d.aiType?.name ?? null, d.knowledge, d.practice,
      ...TOP_FACTORS.map((t) => d.tops?.find((x) => x.id === t.id)?.score ?? null),
      d.weaknesses?.[0] ?? null, d.weaknesses?.[1] ?? null,
    ];
  });
  return { columns, rows: out };
}

export function buildScores(rows: BiSourceRow[]): Table {
  const columns = ["응시자ID", "역량코드", "점수", "자기평가", "자기평가차이", "자기평가판정", "교육대상"];
  const out = rows.flatMap((r) =>
    ((r.detail as ExamResult).mids ?? []).map((m) => [
      pseudoId(r.candidateId), m.id, m.score, m.selfScore, m.gap,
      m.gapNote ? GAP_LABELS[m.gapNote] : m.gap == null ? null : "적정",
      m.score == null ? null : m.score < NEEDS_TRAINING_BELOW ? 1 : 0,
    ]),
  );
  return { columns, rows: out };
}

/** 역량 차원 표: 역량 이름·상위요인·설명 */
export function buildFactors(): Table {
  const columns = ["역량코드", "역량", "상위요인", "설명"];
  const out = MID_FACTORS.map((m) => [
    m.id, m.name, TOP_FACTORS.find((t) => t.id === m.top)!.name, m.desc,
  ]);
  return { columns, rows: out };
}

export function buildTable(table: BiTable, rows: BiSourceRow[]): Table {
  return table === "people" ? buildPeople(rows) : table === "scores" ? buildScores(rows) : buildFactors();
}

// 숫자는 그대로 쓴다 (csvCell 은 "-" 로 시작하는 값을 수식으로 보고 막으므로 음수 차이가 문자로 바뀐다)
const cell = (v: Cell) => (v == null ? "" : typeof v === "number" ? String(v) : csvCell(v));

/** 엑셀·Power BI 에서 한글이 깨지지 않도록 BOM 을 붙인 CSV */
export function toCsv(t: Table): string {
  return "﻿" + [t.columns.map(cell), ...t.rows.map((r) => r.map(cell))].map((r) => r.join(",")).join("\r\n") + "\r\n";
}
