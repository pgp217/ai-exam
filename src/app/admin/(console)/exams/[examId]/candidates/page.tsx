import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { appOrigin } from "@/lib/exams/service";
import CandidatesPanel from "./candidates-panel";

export default async function CandidatesPage({ params }: PageProps<"/admin/exams/[examId]/candidates">) {
  await requireAdmin();
  const { examId } = await params;
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) notFound();
  const [candidates, origin] = await Promise.all([store.listCandidates(examId), appOrigin()]);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">③ 대상자 설정</h2>
      <CandidatesPanel examId={examId} exam={{ ends_at: exam.ends_at, time_limit_min: exam.time_limit_min, status: exam.status }} candidates={candidates} origin={origin} />
    </section>
  );
}
