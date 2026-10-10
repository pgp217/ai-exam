// Power BI 연습용 가상 조직 데이터를 만든다. 관리자 화면의 BI 내보내기와 같은 형식의 CSV 3개를 쓴다.
//   npx tsx scripts/bi-sample.mts [--out docs/bi/sample] [--seed 2026]
// 실제 응시자가 아니다. 부서마다 약한 역량을 일부러 다르게 넣어, 대시보드에서 찾아낼 패턴을 만든다 (docs/bi-dashboard.md 참고).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BiSourceRow } from "../src/lib/attempt/types";
import { BI_TABLES, buildFactors, buildPeople, buildScores, toCsv } from "../src/lib/bi/export";
import { scoringKey } from "../src/lib/exam/answer-key.data";
import type { MidFactorId } from "../src/lib/exam/factors";
import { MID_FACTORS } from "../src/lib/exam/factors";
import { ITEM_SET_VERSION, itemSet } from "../src/lib/exam/items";
import { essayScoreFromCriteria, scoreAttempt } from "../src/lib/exam/scoring";
import { rng } from "../src/lib/exam/simulate";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = arg("out") ?? "docs/bi/sample";
const r = rng(Number(arg("seed") ?? 2026));
const normal = (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r());
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

// 부서: 인원과 역량별 가감(능력치 0~1 기준). selfBias 는 자기평가를 실제보다 높게 보는 정도
const DEPARTMENTS: { name: string; size: number; effect: Partial<Record<MidFactorId, number>>; selfBias: number }[] = [
  { name: "영업팀", size: 60, effect: { M6: -0.2, M7: -0.1 }, selfBias: 0.15 },
  { name: "개발팀", size: 55, effect: { M1: 0.12, M2: 0.12, M6: 0.05, M8: -0.08 }, selfBias: 0.05 },
  { name: "경영지원팀", size: 40, effect: { M3: -0.12, M4: -0.1 }, selfBias: 0 },
  { name: "마케팅팀", size: 35, effect: { M5: 0.08, M7: -0.15 }, selfBias: 0.08 },
  { name: "인사팀", size: 12, effect: { M2: -0.1, M7: 0.1 }, selfBias: -0.03 },
];

// 기수: 2026 상반기부터 프롬프트 실습 교육을 넣었다는 가정 (M3·M4 상승)
const COHORTS: { name: string; date: string; effect: Partial<Record<MidFactorId, number>> }[] = [
  { name: "2025 상반기", date: "2025-03-14", effect: {} },
  { name: "2025 하반기", date: "2025-09-12", effect: { M3: 0.02 } },
  { name: "2026 상반기", date: "2026-03-13", effect: { M3: 0.1, M4: 0.08 } },
];

const version = ITEM_SET_VERSION;
const set = itemSet(version);
const key = scoringKey(version);

const rows: BiSourceRow[] = [];
let n = 0;
for (const dept of DEPARTMENTS) {
  for (let i = 0; i < dept.size; i++) {
    const cohort = pick(COHORTS);
    const base = normal(0.66, 0.11);
    const ability = Object.fromEntries(
      MID_FACTORS.map((m) => [m.id, clamp(base + (dept.effect[m.id] ?? 0) + (cohort.effect[m.id] ?? 0) + normal(0, 0.08), 0.05, 0.98)]),
    ) as Record<MidFactorId, number>;
    const selfBias = dept.selfBias + normal(0, 0.1);

    const choice = Object.fromEntries(set.choice.map((it) => {
      const k = key.answerKey[it.id];
      return [it.id, r() < ability[it.mid as MidFactorId] ? k : ((k + Math.floor(r() * 3)) % 4) + 1];
    }));
    const self = Object.fromEntries(set.self.map((it) => [it.id, clamp(Math.round(1 + 4 * clamp(ability[it.mid as MidFactorId] + selfBias + normal(0, 0.1), 0, 1)), 1, 5)]));
    const essay = Object.fromEntries(set.essay.map((it) => {
      const rubric = key.rubrics.find((x) => x.itemId === it.id)!;
      const criteria = Object.fromEntries(rubric.criteria.map((c) => [c.key, clamp(Math.round(1 + 3 * clamp(ability[it.mid as MidFactorId] - 0.05 + normal(0, 0.15), 0, 1)), 1, 4)]));
      return [it.id, essayScoreFromCriteria(rubric, criteria)];
    }));

    n++;
    const day = new Date(`${cohort.date}T01:00:00Z`);
    day.setUTCMinutes(day.getUTCMinutes() + Math.floor(r() * 4 * 24 * 60)); // 응시 기간 4일 안에서
    rows.push({
      candidateId: `bi-sample-${n}`,
      employee_no: `DEMO-${String(n).padStart(3, "0")}`,
      department: dept.name,
      cohort: cohort.name,
      exam: { id: `bi-sample-${cohort.name}`, title: `${cohort.name} 신입사원 AI 역량 시험 (가상)`, item_set_version: version },
      submittedAt: day.toISOString(),
      durationSec: Math.round(clamp(normal(29, 5), 12, 40) * 60),
      reliability: { level: r() < 0.06 ? "caution" : "reliable", signals: [] },
      detail: scoreAttempt({ choice, self, essay }, set, key.answerKey),
    });
  }
}

mkdirSync(out, { recursive: true });
const tables = { people: buildPeople(rows), scores: buildScores(rows), factors: buildFactors() };
for (const [k, t] of Object.entries(tables)) {
  writeFileSync(join(out, `${BI_TABLES[k as keyof typeof tables].file}.csv`), toCsv(t));
}

// 의도한 패턴이 실제로 나왔는지 확인용 요약: 부서 × 역량 평균
const s = tables.scores;
const idx = (c: string) => s.columns.indexOf(c);
const deptOf = new Map(tables.people.rows.map((p) => [p[0], p[tables.people.columns.indexOf("부서")]]));
console.log(`응시자 ${rows.length}명 → ${out}`);
console.log(["부서", ...MID_FACTORS.map((m) => m.id)].join("\t"));
for (const d of DEPARTMENTS) {
  const avg = MID_FACTORS.map((m) => {
    const xs = s.rows.filter((x) => deptOf.get(x[0]) === d.name && x[idx("역량코드")] === m.id).map((x) => x[idx("점수")] as number);
    return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0);
  });
  console.log([d.name, ...avg].join("\t"));
}
