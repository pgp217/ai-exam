import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { EXAM_STATUS_LABELS, EXAM_STATUS_STYLES } from "@/lib/admin/exam-labels";
import { getStore } from "@/lib/attempt/store";
import { dDay } from "@/lib/exams/form";
import { openBlockers } from "@/lib/exams/service";
import StatusControl from "./status-control";
import Stepper from "./stepper";

export default async function ExamLayout({ children, params }: LayoutProps<"/admin/exams/[examId]">) {
  await requireAdmin();
  const { examId } = await params;
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) notFound();
  const [candidates, notices, blockers] = await Promise.all([store.listCandidates(examId), store.getNotices(examId), openBlockers(exam)]);
  const done = { basic: true, site: true, candidates: candidates.length > 0, notice: notices.length > 0 };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/admin/exams" className="text-sm text-zinc-500 hover:underline">← 시험 관리</Link>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{exam.title}</h1>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${EXAM_STATUS_STYLES[exam.status]}`}>{EXAM_STATUS_LABELS[exam.status]}</span>
              <span className="text-sm text-zinc-500">{dDay(exam).label}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">대상자 {candidates.length}명 · 응시 {candidates.filter((c) => c.attemptStatus).length}명</p>
          </div>
          <StatusControl examId={examId} status={exam.status} blockers={blockers} />
        </div>
        <Stepper examId={examId} done={done} />
      </div>
      {children}
    </div>
  );
}
