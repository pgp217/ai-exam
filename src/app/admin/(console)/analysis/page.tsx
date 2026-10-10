import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { FLAG_LABELS, MIN_RELIABLE_N, analyzeItems, type ItemFlag } from "@/lib/analysis/items";
import { getStore } from "@/lib/attempt/store";
import { scoringKey } from "@/lib/exam/answer-key";
import { MID_FACTORS } from "@/lib/exam/factors";
import { ITEM_SET_VERSION, itemSet } from "@/lib/exam/items";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const midName = (id: string) => MID_FACTORS.find((m) => m.id === id)?.name ?? id;

const FLAG_STYLES: Record<ItemFlag, string> = {
  easy: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  hard: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "low-disc": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "negative-disc": "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "unused-option": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

// 문항 분석: 시험별 객관식 정답률·변별도·보기 분포, 신뢰도, 자기평가 경향, 서술형 기준별 평균과 AI 일치율
export default async function AnalysisPage({ searchParams }: PageProps<"/admin/analysis">) {
  await requireAdmin();
  const sp = await searchParams;
  const store = getStore();
  const exams = await store.listExams();
  const examId = one(sp.exam) ?? exams[0]?.id;
  // 쉼표로 구분한 사번(앞부분 일치)을 분석에서 뺀다. 예: P-000 (리허설)
  const exclude = (one(sp.exclude) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const exam = examId ? await store.getExam(examId) : null;
  // 시험마다 자기 문항 세트 버전으로 분석한다 (v1 결과는 v1 정답·기준표로)
  const version = exam?.item_set_version ?? ITEM_SET_VERSION;
  const set = itemSet(version);
  const key = scoringKey(version);
  const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = set;
  const all = examId ? await store.getAnalysisData(examId) : [];
  const attempts = all.filter((a) => !exclude.some((e) => a.employee_no.startsWith(e)));
  const r = analyzeItems(attempts, set, key.answerKey, key.rubrics);
  const flagged = r.choice.filter((c) => c.flags.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">문항 분석</h1>
          <p className="text-xs text-zinc-500">문항 세트 {version}</p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">시험</span>
            <select name="exam" defaultValue={examId ?? ""} className="rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950">
              {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">제외할 사번 (쉼표로 구분, 앞부분 일치)</span>
            <input name="exclude" defaultValue={exclude.join(", ")} placeholder="예: P-000" className="w-48 rounded border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>
          <button type="submit" className="rounded bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">적용</button>
        </form>
      </div>

      {r.n === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          {all.length > 0 ? `제출된 응시 ${all.length}건이 모두 제외할 사번에 해당합니다. 제외 조건을 바꿔 주세요.` : "이 시험에는 아직 제출된 응시가 없습니다."}
        </p>
      ) : (
        <>
          {r.n < MIN_RELIABLE_N && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              분석 인원이 {r.n}명입니다. {MIN_RELIABLE_N}명 미만에서는 정답률·변별도가 한두 명의 응답으로 크게 바뀌므로 참고용으로만 보세요.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="분석 인원" value={`${r.n}명`} note={`채점 완료 ${r.complete}명${all.length !== r.n ? ` · 제외 ${all.length - r.n}명` : ""}`} />
            <Stat label="지식 점수 평균" value={r.knowledge.mean == null ? "—" : `${r.knowledge.mean}점`} note={r.knowledge.sd == null ? undefined : `표준편차 ${r.knowledge.sd}`} />
            <Stat label="지식 점수 범위" value={r.knowledge.min == null ? "—" : `${r.knowledge.min}~${r.knowledge.max}점`} />
            <Stat
              label="객관식 신뢰도 (KR-20)"
              value={r.kr20 == null ? "—" : String(r.kr20)}
              note={r.kr20 == null ? "점수가 모두 같으면 계산할 수 없습니다" : r.kr20 >= 0.7 ? "양호 (0.7 이상)" : "낮음 (0.7 미만): 문항이 같은 역량을 일관되게 재지 못함"}
            />
          </dl>

          <section className="space-y-2" aria-labelledby="flag-title">
            <h2 id="flag-title" className="font-semibold">점검이 필요한 객관식 {flagged.length}문항</h2>
            {flagged.length === 0 ? <p className="text-sm text-zinc-500">없습니다.</p> : (
              <ul className="flex flex-wrap gap-2 text-sm">
                {flagged.map((c) => (
                  <li key={c.itemId}><a href={`#${c.itemId}`} className="rounded border border-zinc-300 px-2 py-1 hover:underline dark:border-zinc-700">{c.itemId} · {c.flags.map((f) => FLAG_LABELS[f].split(" (")[0]).join(", ")}</a></li>
                ))}
              </ul>
            )}
            <p className="text-xs text-zinc-500">
              정답률이 90% 이상이면 너무 쉽고 20% 이하면 너무 어려운 문항입니다. 변별도(r)는 이 문항을 맞힌 사람이 나머지 객관식도 잘했는지를 나타내며, 0.2 미만이면 잘하는 사람과 못하는 사람을 잘 가르지 못하고 음수면 잘하는 사람이 오히려 더 틀린 문항입니다.
            </p>
          </section>

          <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800" aria-labelledby="choice-title">
            <h2 id="choice-title" className="px-3 pt-3 font-semibold">객관식 {CHOICE_ITEMS.length}문항</h2>
            <table className="mt-2 w-full min-w-[860px] text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">문항</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">정답률</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">변별도 r</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">상하위 차 D</th>
                  {[1, 2, 3, 4].map((o) => <th key={o} className="whitespace-nowrap px-2 py-2 text-center font-medium">보기 {o}</th>)}
                  <th className="whitespace-nowrap px-2 py-2 text-center font-medium">무응답</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {r.choice.map((c) => {
                  const item = CHOICE_ITEMS.find((i) => i.id === c.itemId)!;
                  return (
                    <tr key={c.itemId} id={c.itemId} className="align-top">
                      <td className="px-3 py-2">
                        <p><strong>{c.itemId}</strong> <span className="text-xs text-zinc-500">{midName(c.mid)}</span></p>
                        <p className="mt-0.5 whitespace-pre-line text-zinc-600 dark:text-zinc-400">{item.prompt}</p>
                        {c.flags.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {c.flags.map((f) => <span key={f} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${FLAG_STYLES[f]}`}>{FLAG_LABELS[f]}</span>)}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{pct(c.p)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.r ?? "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.d}</td>
                      {c.options.map((count, o) => {
                        const correct = o + 1 === c.correct;
                        return (
                          <td key={o} className={`px-2 py-2 text-center tabular-nums ${correct ? "font-semibold text-emerald-700 dark:text-emerald-400" : ""}`} title={item.options[o]}>
                            {count}{correct && <span className="sr-only"> (정답)</span>}
                            {correct && <span aria-hidden className="ml-0.5">✓</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center tabular-nums text-zinc-500">{c.blank}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 pb-3 text-xs text-zinc-500">✓ 는 정답 보기입니다. 보기 칸에 마우스를 올리면 보기 내용이 보입니다. 오답 보기에 응답이 몰리면 문구가 헷갈리게 쓰였는지 확인해 보세요.</p>
          </section>

          <section className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800" aria-labelledby="self-title">
            <h2 id="self-title" className="px-3 pt-3 font-semibold">자기평가 {SELF_ITEMS.length}문항</h2>
            <table className="mt-2 w-full min-w-[760px] text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">문항</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">평균 (1~5)</th>
                  {[1, 2, 3, 4, 5].map((v) => <th key={v} className="px-2 py-2 text-center font-medium">{v}</th>)}
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">자기평가 vs 실제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {r.self.map((s) => (
                  <tr key={s.itemId} className="align-top">
                    <td className="px-3 py-2">
                      <p><strong>{s.itemId}</strong> <span className="text-xs text-zinc-500">{s.midName}</span></p>
                      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{SELF_ITEMS.find((i) => i.id === s.itemId)!.prompt}</p>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{s.mean ?? "—"}</td>
                    {s.counts.map((c, i) => <td key={i} className="px-2 py-2 text-center tabular-nums">{c}</td>)}
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                      {s.gap == null ? "—" : (
                        <>
                          <span className={s.gap > 15 ? "text-red-600" : s.gap < -15 ? "text-blue-600 dark:text-blue-400" : ""}>{s.gap > 0 ? "+" : ""}{s.gap}</span>
                          <span className="block text-xs text-zinc-500">{s.selfScore} vs {s.actual}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 pb-3 text-xs text-zinc-500">
              자기평가 vs 실제: 채점 완료자의 자기평가(0~100 환산) 평균에서 해당 요인 실제 점수 평균을 뺀 값입니다. +15 초과는 과대평가(빨강), -15 미만은 과소평가(파랑) 경향입니다. 4·5점에 몰리면 문항이 바람직한 답을 고르게 만드는지 점검하세요.
            </p>
          </section>

          <section className="space-y-3" aria-labelledby="essay-title">
            <h2 id="essay-title" className="font-semibold">서술형 기준별 점수 (1~4)와 AI 일치율</h2>
            <div className="grid gap-3 lg:grid-cols-3">
              {r.essay.map((e) => (
                <div key={e.itemId} className="min-w-0 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="text-sm font-semibold">{e.itemId} {ESSAY_ITEMS.find((i) => i.id === e.itemId)!.title}</p>
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs text-zinc-500">
                      <tr><th className="py-1 font-medium">기준</th><th className="py-1 text-right font-medium">확정</th><th className="py-1 text-right font-medium">AI</th><th className="py-1 text-right font-medium">일치</th></tr>
                    </thead>
                    <tbody>
                      {e.criteria.map((c) => (
                        <tr key={c.key} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className="py-1">{c.name}</td>
                          <td className="py-1 text-right tabular-nums">{c.mean ?? "—"}</td>
                          <td className="py-1 text-right tabular-nums text-zinc-500">{c.aiMean ?? "—"}</td>
                          <td className={`py-1 text-right tabular-nums ${c.agreement != null && c.agreement < 0.6 ? "font-semibold text-red-600" : ""}`}>{pct(c.agreement)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              일치: AI 기준 점수와 담당자 확정 점수가 같은 비율입니다(둘 다 있는 응답만). 60% 미만이면 채점 기준표 문구가 모호하거나 AI 가 그 기준을 다르게 해석하는지 살펴보세요. 확정 기록이 없는 응시는 서술형 표에 들어가지 않습니다.
            </p>
          </section>

          <p className="text-xs text-zinc-500">
            채점이 끝나지 않은 응시도 객관식·자기평가 분석에는 들어갑니다. 개인별 답안은 <Link href="/admin/results" className="underline">결과 목록</Link>에서 봅니다.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-zinc-500">{note}</dd>}
    </div>
  );
}
