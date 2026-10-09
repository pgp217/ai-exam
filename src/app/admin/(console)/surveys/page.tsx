import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { SURVEY_QUESTIONS, summarizeSurveys } from "@/lib/survey/survey";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// 응시 후 설문 결과: 문항별 평균·분포, 오류·불편 신고, 자유 의견
export default async function SurveysPage({ searchParams }: PageProps<"/admin/surveys">) {
  await requireAdmin();
  const examId = one((await searchParams).exam);
  const store = getStore();
  const [surveys, exams] = await Promise.all([store.listSurveys(examId), store.listExams()]);
  const sum = summarizeSurveys(surveys);
  const issues = surveys.filter((s) => s.had_issue);
  const comments = surveys.filter((s) => s.comment);
  const max = Math.max(1, ...sum.questions.flatMap((q) => q.counts));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-bold">응시 후 설문</h1>
        <form method="get" className="flex items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">시험</span>
            <select name="exam" defaultValue={examId ?? ""} className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">전체</option>
              {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">적용</button>
        </form>
      </div>
      <p className="text-sm text-zinc-500">
        응답 {sum.count}건 · 오류·불편 신고 {sum.issueCount}건. 설문은 시험의 <strong>② 응시 사이트</strong>에서 &ldquo;응시 후 설문 받기&rdquo;를 켠 시험에서만 받습니다.
      </p>

      {sum.count === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">아직 설문 응답이 없습니다.</p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800" aria-labelledby="dist-title">
            <h2 id="dist-title" className="sr-only">문항별 응답 분포</h2>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">문항</th>
                  <th className="px-3 py-2 text-right font-medium">평균</th>
                  {[1, 2, 3, 4, 5].map((n) => <th key={n} className="w-16 px-2 py-2 text-center font-medium">{n}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {sum.questions.map((s) => {
                  const q = SURVEY_QUESTIONS.find((x) => x.id === s.id)!;
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        {q.text}
                        <span className="block text-xs text-zinc-500">1 {q.low} · 5 {q.high}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{s.mean ?? "—"}</td>
                      {s.counts.map((c, i) => (
                        <td key={i} className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <div className="h-2 rounded-sm bg-blue-600 dark:bg-blue-400" style={{ width: `${(c / max) * 32}px` }} aria-hidden />
                            <span className="text-xs tabular-nums text-zinc-500">{c}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="space-y-2" aria-labelledby="issue-title">
            <h2 id="issue-title" className="font-semibold">오류·불편 신고 {issues.length}건</h2>
            {issues.length === 0 ? <p className="text-sm text-zinc-500">없습니다.</p> : (
              <ul className="space-y-2">
                {issues.map((s) => (
                  <li key={s.attemptId} className="rounded-lg border border-red-200 p-3 text-sm dark:border-red-900">
                    <p className="text-xs text-zinc-500">
                      <Link href={`/admin/results/${s.attemptId}`} className="underline">{s.candidate.name}</Link> · {s.exam.title} · {fmt.format(new Date(s.created_at))}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{s.issue ?? "(내용 없음)"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="comment-title">
            <h2 id="comment-title" className="font-semibold">자유 의견 {comments.length}건</h2>
            {comments.length === 0 ? <p className="text-sm text-zinc-500">없습니다.</p> : (
              <ul className="space-y-2">
                {comments.map((s) => (
                  <li key={s.attemptId} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <p className="text-xs text-zinc-500">
                      <Link href={`/admin/results/${s.attemptId}`} className="underline">{s.candidate.name}</Link> · {s.exam.title} · {fmt.format(new Date(s.created_at))}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{s.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
