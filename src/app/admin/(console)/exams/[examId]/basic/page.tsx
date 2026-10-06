import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { isoToKstInput } from "@/lib/exams/form";
import BasicForm from "../../basic-form";

export default async function BasicPage({ params }: PageProps<"/admin/exams/[examId]/basic">) {
  await requireAdmin();
  const { examId } = await params;
  const exam = await getStore().getExam(examId);
  if (!exam) notFound();
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">① 기본 설정</h2>
      <BasicForm examId={examId} values={{ title: exam.title, starts: isoToKstInput(exam.starts_at), ends: isoToKstInput(exam.ends_at) }} />
    </section>
  );
}
