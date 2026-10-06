import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import SiteForm from "./site-form";

export default async function SitePage({ params }: PageProps<"/admin/exams/[examId]/site">) {
  await requireAdmin();
  const { examId } = await params;
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) notFound();
  const started = (await store.listCandidates(examId)).some((c) => c.attemptStatus);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">② 응시 사이트 설정</h2>
      <SiteForm examId={examId} values={{ time_limit_min: exam.time_limit_min, intro_text: exam.intro_text, show_result: exam.show_result }} started={started} />
    </section>
  );
}
