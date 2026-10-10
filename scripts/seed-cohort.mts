// 가상 동기 응시자를 Supabase 시험에 넣거나 지운다 (상위 %·분포 확인용).
//   npx tsx scripts/seed-cohort.mts --exam <exam_id> [--count 30]
//   npx tsx scripts/seed-cohort.mts --exam <exam_id> --remove
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_SECRET_KEY)
// 가상 응시자는 사번이 SIM- 으로 시작하고 이름에 "가상" 이 붙는다. 서술형은 확정 점수만 있고 답안·채점 기록은 없다.
import { scoringKey } from "../src/lib/exam/answer-key.data";
import { itemSet } from "../src/lib/exam/items";
import { simulateCohort } from "../src/lib/exam/simulate";
import { scoreSubmission } from "../src/lib/attempt/responses";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const examId = arg("exam");
const count = Number(arg("count") ?? 30);
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
if (!examId || !url || !key) {
  console.error("사용법: npx tsx scripts/seed-cohort.mts --exam <exam_id> [--count 30 | --remove]  (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요)");
  process.exit(1);
}

const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

async function rest<T>(path: string, method = "GET", body?: unknown, prefer = "return=representation"): Promise<T> {
  const res = await fetch(`${url}/rest/v1${path}`, { method, headers: { ...headers, Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

if (args.includes("--remove")) {
  const removed = await rest<unknown[]>(`/candidates?exam_id=eq.${examId}&employee_no=like.SIM-*`, "DELETE");
  console.log(`가상 응시자 ${removed.length}명을 지웠습니다 (응시·응답·결과 함께 삭제).`);
  process.exit(0);
}

const [exam] = await rest<{ id: string; title: string; item_set_version: string }[]>(`/exams?id=eq.${examId}&select=id,title,item_set_version`);
if (!exam) throw new Error("시험을 찾을 수 없습니다.");
// 가상 응시자도 그 시험의 문항 세트 버전으로 만든다
const set = itemSet(exam.item_set_version);
const scoring = scoringKey(exam.item_set_version);
const existing = await rest<unknown[]>(`/candidates?exam_id=eq.${examId}&employee_no=like.SIM-*&select=id`);
if (existing.length > 0) {
  console.error(`이미 가상 응시자 ${existing.length}명이 있습니다. 먼저 --remove 로 지우세요.`);
  process.exit(1);
}

const sims = simulateCohort(count, set, scoring.answerKey, scoring.rubrics);
const candidates = await rest<{ id: string; employee_no: string }[]>(
  "/candidates?select=id,employee_no",
  "POST",
  sims.map((s) => ({ exam_id: examId, employee_no: s.employee_no, name: s.name, department: s.department, cohort: "2026-하반기" })),
);
const now = Date.now();
for (const [i, s] of sims.entries()) {
  const candidateId = candidates.find((c) => c.employee_no === s.employee_no)!.id;
  const submitted = new Date(now - (count - i) * 3600_000);
  const { detail, reliability } = scoreSubmission(s.responses, set, scoring.answerKey, s.essayScores);
  const [attempt] = await rest<{ id: string }[]>("/attempts?select=id", "POST", {
    candidate_id: candidateId, status: "complete", duration_sec: s.durationSec, reliability,
    started_at: new Date(submitted.getTime() - s.durationSec * 1000).toISOString(), submitted_at: submitted.toISOString(),
  });
  await rest("/responses", "POST", s.responses.map((r) => ({ attempt_id: attempt.id, ...r })), "return=minimal");
  await rest("/results", "POST", {
    attempt_id: attempt.id, knowledge_score: detail.knowledge, practice_score: detail.practice, total: detail.total,
    grade: detail.grade, ai_type: detail.aiType?.name, detail, status: "complete",
  }, "return=minimal");
}
console.log(`"${exam.title}" 에 가상 응시자 ${count}명을 넣었습니다.`);
