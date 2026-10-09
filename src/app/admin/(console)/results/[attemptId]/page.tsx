import Link from "next/link";
import { notFound } from "next/navigation";
import Report from "@/components/report/report";
import { requireAdmin } from "@/lib/admin/auth";
import { RELIABILITY_STYLES } from "@/lib/admin/labels";
import { RELIABILITY_LABELS, SIGNAL_LABELS, type ReliabilityResult } from "@/lib/exam/reliability";
import { CHAPTERS } from "@/lib/exam/factors";
import { loadReport } from "@/lib/report/service";
import { graderMode } from "@/lib/grading/mode";
import { getStore } from "@/lib/attempt/store";
import SurveyAnswers from "../../surveys/survey-answers";
import FeedbackEditor from "./feedback-editor";

// 피드백 다시 생성(Server Action)이 Claude API 를 기다린다
export const maxDuration = 300;

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function AdminReportPage({ params }: PageProps<"/admin/results/[attemptId]">) {
  await requireAdmin();
  const { attemptId } = await params;
  const loaded = await loadReport(attemptId);
  if (!loaded) notFound();
  const { report, result, cohort, feedback } = loaded;
  const rel = report.reliability as ReliabilityResult | null;
  const survey = (await getStore().listSurveys(report.exam.id)).find((s) => s.attemptId === attemptId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/results" className="text-sm text-zinc-500 hover:underline">← 결과 목록</Link>
        <h1 className="mt-2 text-2xl font-bold">{report.candidate.name} 결과 리포트</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {[report.candidate.employee_no, report.candidate.department, report.candidate.cohort, report.exam.title].filter(Boolean).join(" · ")}
          {report.submittedAt && ` · 제출 ${fmt.format(new Date(report.submittedAt))}`}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            응답 신뢰도: {rel ? <span className={RELIABILITY_STYLES[rel.level]}>{RELIABILITY_LABELS[rel.level]}</span> : "—"}
            {rel && rel.signals.length > 0 && <span className="text-zinc-500"> ({rel.signals.map((s) => SIGNAL_LABELS[s]).join(", ")})</span>}
          </span>
          <Link href={`/admin/grading/${attemptId}`} className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">서술형 채점 보기</Link>
          <span className="text-xs text-zinc-500">응시자 공개: {report.exam.show_result ? "공개 시험 (확정 후 응시 링크에서 열람)" : "비공개 시험"}</span>
        </div>
      </div>

      {survey && (
        <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer font-semibold">
            응시 후 설문 {survey.had_issue && <span className="ml-1 text-sm font-medium text-red-600">· 오류·불편 신고 있음</span>}
          </summary>
          <div className="mt-3"><SurveyAnswers survey={survey} /></div>
        </details>
      )}

      {!result ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          서술형 채점이 모두 확정되면 리포트가 만들어집니다. <Link href={`/admin/grading/${attemptId}`} className="underline">채점하러 가기</Link>
        </p>
      ) : (
        <>
          <FeedbackEditor
            attemptId={attemptId}
            feedback={feedback}
            canGenerate={graderMode() !== "none"}
            chapters={Object.entries(CHAPTERS).map(([id, c]) => ({ id, title: c.title }))}
            suggested={result.review.map((c) => c.id)}
          />
          <div>
            <p className="mb-2 text-sm text-zinc-500">아래는 응시자에게 보이는 리포트입니다. 피드백은 승인한 뒤에만 표시됩니다.</p>
            <Report result={result} cohort={cohort} feedback={feedback?.status === "approved" ? feedback : null} feedbackPending={feedback?.status !== "approved"} />
          </div>
        </>
      )}
    </div>
  );
}
