import { describe, expect, it } from "vitest";
import type { BiSourceRow } from "../../attempt/types";
import { scoringKey } from "../../exam/answer-key.data";
import { MID_FACTORS } from "../../exam/factors";
import { itemSet } from "../../exam/items";
import { scoreAttempt } from "../../exam/scoring";
import { buildFactors, buildPeople, buildScores, excludeRows, pseudoId, toCsv } from "../export";

const VERSION = "NEWHIRE-AI-v2";
const set = itemSet(VERSION);
const key = scoringKey(VERSION);

// 객관식은 모두 정답, 자기평가는 모두 5점(과대평가가 나오도록), 서술형은 10점 (서술형이 걸린 역량은 (100+10)/2 = 55점)
function row(id: string, employee_no: string, department: string | null): BiSourceRow {
  const detail = scoreAttempt(
    {
      choice: Object.fromEntries(set.choice.map((i) => [i.id, key.answerKey[i.id]])),
      self: Object.fromEntries(set.self.map((i) => [i.id, 5])),
      essay: Object.fromEntries(set.essay.map((i) => [i.id, 10])),
    },
    set,
    key.answerKey,
  );
  return {
    candidateId: id, employee_no, department, cohort: "2026 상반기",
    exam: { id: "e1", title: "파일럿", item_set_version: VERSION },
    submittedAt: "2026-10-09T16:30:00Z", durationSec: 1530, reliability: { level: "caution", signals: [] }, detail,
  };
}

const rows = [row("c-1", "P-001", "영업팀"), row("c-2", "P-000", null), row("c-3", "SIM-001", "개발팀")];

describe("BI 내보내기", () => {
  it("makes a stable pseudonymous id that does not contain the employee number", () => {
    expect(pseudoId("c-1")).toBe(pseudoId("c-1"));
    expect(pseudoId("c-1")).not.toBe(pseudoId("c-2"));
    expect(pseudoId("c-1")).toMatch(/^R-[0-9A-F]{8}$/);
  });

  it("excludes rows by employee number prefix", () => {
    expect(excludeRows(rows, ["P-000", "SIM-"]).map((r) => r.employee_no)).toEqual(["P-001"]);
  });

  it("writes one row per person without names or employee numbers", () => {
    const t = buildPeople(rows);
    expect(t.rows).toHaveLength(3);
    const csv = toCsv(t);
    for (const s of ["P-001", "P-000", "SIM-001"]) expect(csv).not.toContain(s);
    const get = (r: number, c: string) => t.rows[r][t.columns.indexOf(c)];
    expect(get(0, "부서")).toBe("영업팀");
    expect(get(1, "부서")).toBe("미지정");
    expect(get(0, "응시일")).toBe("2026-10-10"); // KST 기준
    expect(get(0, "응시시간_분")).toBe(25.5);
    expect(get(0, "응답신뢰도")).toBe("주의");
    expect(get(0, "지식점수")).toBe(100);
  });

  it("writes 8 factor rows per person and keeps negative gaps numeric", () => {
    const t = buildScores(rows.slice(0, 1));
    expect(t.rows).toHaveLength(MID_FACTORS.length);
    const col = (c: string) => t.columns.indexOf(c);
    const essayMid = t.rows.find((r) => r[col("점수")] != null && (r[col("점수")] as number) < 60)!;
    expect(essayMid[col("교육대상")]).toBe(1);
    expect(essayMid[col("자기평가판정")]).toBe("과대평가");

    const csv = toCsv({ columns: ["차이"], rows: [[-12.5], ["-수식"]] });
    expect(csv).toBe("﻿차이\r\n-12.5\r\n'-수식\r\n");
  });

  it("lists every mid factor once in the factor table", () => {
    expect(buildFactors().rows.map((r) => r[0])).toEqual(MID_FACTORS.map((m) => m.id));
  });
});
