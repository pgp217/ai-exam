import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import type { AttemptStatus } from "@/lib/attempt/types";
import { RELIABILITY_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/admin/labels";
import { RELIABILITY_LABELS, SIGNAL_LABELS, type ReliabilityResult } from "@/lib/exam/reliability";
import { agreementRate } from "@/lib/grading/grade";
import { graderMode } from "@/lib/grading/service";

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function GradingQueuePage() {
  await requireAdmin();
  const rows = await getStore().listQueue();

  const pairs = rows.flatMap((r) =>
    r.essays.flatMap((e) => {
      const ai = e.final?.ai_grading_id ? r.aiGradingsById[e.final.ai_grading_id] : undefined;
      return e.final && ai ? [{ ai, final: e.final.criterion_scores }] : [];
    }),
  );
  const agreement = agreementRate(pairs);
  const count = (s: AttemptStatus) => rows.filter((r) => r.status === s).length;
  const mode = graderMode();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold">서술형 채점</h1>
        <p className="text-sm text-zinc-500">
          AI 1차 채점: {mode === "claude" ? "Claude API" : mode === "fake" ? "가짜 채점(개발용)" : "사용 불가 — ANTHROPIC_API_KEY 없음"}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="AI 채점 대기" value={`${count("submitted")}명`} />
        <Stat label="검토 대기" value={`${count("grading")}명`} />
        <Stat label="채점 완료" value={`${count("complete")}명`} />
        <Stat
          label="AI-담당자 일치율"
          value={agreement.rate == null ? "—" : `${agreement.rate}%`}
          note={agreement.total > 0 ? `기준 ${agreement.total}개 중 ${agreement.matched}개 일치` : "확정된 채점이 없습니다"}
        />
      </dl>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">아직 제출된 답안이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">응시자</th>
                <th className="px-3 py-2 font-medium">제출</th>
                <th className="px-3 py-2 font-medium">응답 신뢰도</th>
                <th className="px-3 py-2 font-medium">AI 채점</th>
                <th className="px-3 py-2 font-medium">확정</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r) => {
                const rel = r.reliability as ReliabilityResult | null;
                const ai = r.essays.filter((e) => e.ai).length;
                const fin = r.essays.filter((e) => e.final).length;
                return (
                  <tr key={r.attemptId}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.candidate.name}</div>
                      <div className="text-xs text-zinc-500">
                        {[r.candidate.employee_no, r.candidate.department, r.examTitle].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-600">{r.submittedAt ? fmt.format(new Date(r.submittedAt)) : "—"}</td>
                    <td className="px-3 py-2">
                      {rel ? (
                        <span className={RELIABILITY_STYLES[rel.level]} title={rel.signals.map((s) => SIGNAL_LABELS[s]).join(", ")}>
                          {RELIABILITY_LABELS[rel.level]}
                          {rel.signals.length > 0 && <span className="text-xs text-zinc-500"> ({rel.signals.length})</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{ai}/{r.essays.length}</td>
                    <td className="px-3 py-2 tabular-nums">{fin}/{r.essays.length}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/admin/grading/${r.attemptId}`} className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900">
                        {r.status === "complete" ? "보기" : "검토"}
                      </Link>
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

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-zinc-500">{note}</dd>}
    </div>
  );
}
