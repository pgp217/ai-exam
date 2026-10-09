import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { EXAM_STATUS_LABELS, EXAM_STATUS_STYLES } from "@/lib/admin/exam-labels";
import { getStore } from "@/lib/attempt/store";
import { dDay } from "@/lib/exams/form";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function ExamsPage() {
  await requireAdmin();
  const exams = await getStore().listExamSummaries();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">시험 관리</h1>
        <Link href="/admin/exams/new" className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">새 시험 만들기</Link>
      </div>
      {exams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">아직 시험이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>{["시험명", "응시 기간", "D-day", "상태", "대상자", "응시", "제출", "채점 완료", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {exams.map((e) => (
                <tr key={e.id}>
                  <td className="min-w-48 px-3 py-2 font-medium">{e.title}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-600">{fmt.format(new Date(e.starts_at))} ~ {fmt.format(new Date(e.ends_at))}</td>
                  <td className="whitespace-nowrap px-3 py-2">{dDay(e).label}</td>
                  <td className="px-3 py-2"><span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${EXAM_STATUS_STYLES[e.status]}`}>{EXAM_STATUS_LABELS[e.status]}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.candidates}명</td>
                  <td className="px-3 py-2 tabular-nums">{e.started}</td>
                  <td className="px-3 py-2 tabular-nums">{e.submitted}</td>
                  <td className="px-3 py-2 tabular-nums">{e.complete}</td>
                  <td className="px-3 py-2 text-right"><Link href={`/admin/exams/${e.id}/basic`} className="inline-block whitespace-nowrap rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">관리</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
