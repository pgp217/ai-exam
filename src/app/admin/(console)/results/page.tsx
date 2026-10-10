import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { RELIABILITY_STYLES } from "@/lib/admin/labels";
import { getStore } from "@/lib/attempt/store";
import { GRADE_BANDS } from "@/lib/exam/scoring";
import { RELIABILITY_LABELS } from "@/lib/exam/reliability";
import { BI_TABLES } from "@/lib/bi/export";
import { STAGE_LABELS, distinct, filterResults, reliabilityOf, stageOf, summarize, type ResultFilters, type Stage } from "@/lib/report/filter";

const STAGE_STYLES: Record<Stage, string> = {
  not_started: "bg-zinc-100 text-zinc-500",
  in_progress: "bg-zinc-100 text-zinc-700",
  ai_pending: "bg-amber-50 text-amber-700",
  review: "bg-blue-50 text-blue-700",
  complete: "bg-emerald-50 text-emerald-700",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function ResultsPage({ searchParams }: PageProps<"/admin/results">) {
  await requireAdmin();
  const sp = await searchParams;
  const f: ResultFilters = {
    exam: one(sp.exam), q: one(sp.q), dept: one(sp.dept), cohort: one(sp.cohort),
    stage: one(sp.stage), reliability: one(sp.reliability), grade: one(sp.grade),
  };
  const store = getStore();
  const [all, exams] = await Promise.all([store.listResults(), store.listExams()]);
  const inExam = f.exam ? all.filter((r) => r.exam.id === f.exam) : all;
  const rows = filterResults(all, f);
  const sum = summarize(rows);
  const filtered = Object.values(f).some(Boolean);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">결과 목록</h1>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <Select name="exam" label="시험" value={f.exam} options={exams.map((e) => [e.id, e.title])} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">이름·사번</span>
          <input name="q" defaultValue={f.q} placeholder="검색" className="w-32 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <Select name="dept" label="소속" value={f.dept} options={distinct(inExam, (r) => r.candidate.department).map((d) => [d, d])} />
        <Select name="cohort" label="기수" value={f.cohort} options={distinct(inExam, (r) => r.candidate.cohort).map((d) => [d, d])} />
        <Select name="stage" label="상태" value={f.stage} options={Object.entries(STAGE_LABELS)} />
        <Select name="reliability" label="응답 신뢰도" value={f.reliability} options={Object.entries(RELIABILITY_LABELS)} />
        <Select name="grade" label="등급" value={f.grade} options={GRADE_BANDS.map((g) => [g.grade, g.grade])} />
        <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">적용</button>
        {filtered && <Link href="/admin/results" className="px-2 py-1.5 text-zinc-500 underline">초기화</Link>}
      </form>

      <form method="get" action="/admin/results/export" className="flex flex-wrap items-end gap-2 text-sm">
        {f.exam && <input type="hidden" name="exam" value={f.exam} />}
        <span className="mr-1 self-center text-xs text-zinc-500">
          BI 내보내기 ({f.exam ? "선택한 시험" : "모든 시험"}, 채점 완료만 · 이름·사번 제외)
        </span>
        <input name="exclude" placeholder="제외할 사번 예: P-000, SIM-" className="w-52 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
        {Object.entries(BI_TABLES).map(([k, t]) => (
          <button key={k} type="submit" name="table" value={k} className="whitespace-nowrap rounded border border-zinc-300 px-2 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
            {t.label}.csv
          </button>
        ))}
      </form>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="대상자" value={`${sum.total}명`} />
        <Stat label="제출" value={`${sum.submitted}명`} note={sum.total ? `${Math.round((sum.submitted / sum.total) * 100)}%` : undefined} />
        <Stat label="채점 완료" value={`${sum.complete}명`} />
        <Stat label="평균 종합 점수" value={sum.avgTotal == null ? "—" : `${sum.avgTotal}점`} note="채점 완료자 기준" />
      </dl>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">조건에 맞는 대상자가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                {["이름", "사번", "소속", "기수", "상태", "응답 신뢰도", "유형", "종합", "피드백", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => {
                const stage = stageOf(r);
                const rel = reliabilityOf(r);
                const done = r.result?.status === "complete";
                return (
                  <tr key={r.candidateId}>
                    <td className="px-3 py-2 font-medium">{r.candidate.name}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600">{r.candidate.employee_no}</td>
                    <td className="px-3 py-2 text-zinc-600">{r.candidate.department ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">{r.candidate.cohort ?? "—"}</td>
                    <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}>{STAGE_LABELS[stage]}</span></td>
                    <td className="px-3 py-2">{rel ? <span className={RELIABILITY_STYLES[rel]}>{RELIABILITY_LABELS[rel]}</span> : "—"}</td>
                    <td className="px-3 py-2">{done ? r.result!.aiType : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{done ? <><strong>{r.result!.grade}</strong> {r.result!.total}</> : "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {done ? (r.result!.feedbackStatus === "approved" ? "공개됨" : r.result!.feedbackStatus === "draft" ? "확인 필요" : "없음") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {done ? (
                        <Link href={`/admin/results/${r.attempt!.id}`} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">리포트</Link>
                      ) : r.attempt && stage !== "in_progress" ? (
                        <Link href={`/admin/grading/${r.attempt.id}`} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">채점</Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="max-w-48 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
        <option value="">전체</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-zinc-500">{note}</dd>}
    </div>
  );
}
