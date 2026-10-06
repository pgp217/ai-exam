import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { RELIABILITY_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/admin/labels";
import { scoreSubmission } from "@/lib/attempt/responses";
import { getStore } from "@/lib/attempt/store";
import { ANSWER_KEY, rubricFor } from "@/lib/exam/answer-key";
import { ESSAY_ITEMS } from "@/lib/exam/items";
import { RELIABILITY_LABELS, SIGNAL_LABELS, type ReliabilityResult } from "@/lib/exam/reliability";
import { FAKE_MODEL } from "@/lib/grading/grade";
import { graderMode } from "@/lib/grading/service";
import EssayReview from "./essay-review";
import RunAiButton from "./run-ai-button";

// 이 페이지의 Server Action(AI 다시 채점)이 Claude API 를 기다린다
export const maxDuration = 300;

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function ReviewPage({ params }: PageProps<"/admin/grading/[attemptId]">) {
  await requireAdmin();
  const { attemptId } = await params;
  const review = await getStore().getReviewAttempt(attemptId);
  if (!review || review.attempt.status === "in_progress") notFound();

  const { attempt, candidate } = review;
  const rel = attempt.reliability as ReliabilityResult | null;
  const finalScores = Object.fromEntries(
    ESSAY_ITEMS.map((e) => {
      const resp = review.responses.find((r) => r.item_id === e.id);
      return [e.id, review.finals.find((f) => f.response_id === resp?.id)?.score ?? null];
    }),
  );
  const { detail } = scoreSubmission(review.responses, ANSWER_KEY, finalScores);
  const essaysWithoutAi = ESSAY_ITEMS.filter((e) => {
    const resp = review.responses.find((r) => r.item_id === e.id);
    return !resp || !review.aiGradings.some((g) => g.response_id === resp.id);
  });
  const mode = graderMode();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/grading" className="text-sm text-zinc-500 hover:underline">← 서술형 채점 목록</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{candidate.name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[attempt.status]}`}>{STATUS_LABELS[attempt.status]}</span>
          {attempt.status === "complete" && (
            <Link href={`/admin/results/${attempt.id}`} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">리포트·피드백 보기</Link>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {[candidate.employee_no, candidate.department, candidate.cohort, review.exam.title].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="제출">
          {attempt.submitted_at ? fmt.format(new Date(attempt.submitted_at)) : "—"}
          <span className="block text-xs text-zinc-500">응시 시간 {attempt.duration_sec != null ? `${Math.round(attempt.duration_sec / 60)}분` : "—"}</span>
        </Card>
        <Card label="응답 신뢰도">
          {rel ? <span className={RELIABILITY_STYLES[rel.level]}>{RELIABILITY_LABELS[rel.level]}</span> : "—"}
          {rel && rel.signals.length > 0 && (
            <ul className="mt-1 text-xs text-zinc-500">{rel.signals.map((s) => <li key={s}>· {SIGNAL_LABELS[s]}</li>)}</ul>
          )}
        </Card>
        <Card label="지식 점수 (객관식)">{detail.knowledge}점</Card>
        <Card label="결과">
          {detail.status === "complete" ? (
            <>
              종합 {detail.total}점 · {detail.grade}
              <span className="block text-xs text-zinc-500">실전 {detail.practice}점 · {detail.aiType?.name}</span>
            </>
          ) : (
            <span className="text-zinc-500">서술형 {Object.values(finalScores).filter((v) => v != null).length}/{ESSAY_ITEMS.length} 확정</span>
          )}
        </Card>
      </section>

      {essaysWithoutAi.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span>
            AI 1차 채점이 없는 문항: {essaysWithoutAi.map((e) => e.id).join(", ")}
            {mode === "none" && " (ANTHROPIC_API_KEY 가 없어 AI 채점을 할 수 없습니다. 직접 채점해 확정할 수 있습니다.)"}
          </span>
          {mode !== "none" && <RunAiButton attemptId={attempt.id} label="AI 채점 실행" />}
        </div>
      )}

      {ESSAY_ITEMS.map((item, n) => {
        const resp = review.responses.find((r) => r.item_id === item.id);
        const ais = review.aiGradings.filter((g) => g.response_id === resp?.id);
        const final = review.finals.find((f) => f.response_id === resp?.id) ?? null;
        return (
          <EssayReview
            key={item.id}
            index={n + 1}
            attemptId={attempt.id}
            item={item}
            rubric={rubricFor(item.id)}
            response={resp ? { text: "text" in resp.answer ? resp.answer.text : "", pasted: resp.pasted, responseMs: resp.response_ms } : null}
            ai={ais[0] ?? null}
            aiCount={ais.length}
            aiIsFake={ais[0]?.model === FAKE_MODEL}
            final={final}
            canRunAi={mode !== "none"}
          />
        );
      })}
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <div className="mt-1 font-medium">{children}</div>
    </div>
  );
}
