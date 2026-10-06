import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { appOrigin } from "@/lib/exams/service";
import NoticeEditor from "./notice-editor";

export default async function NoticePage({ params }: PageProps<"/admin/exams/[examId]/notice">) {
  await requireAdmin();
  const { examId } = await params;
  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) notFound();
  const [notices, candidates, origin] = await Promise.all([store.getNotices(examId), store.listCandidates(examId), appOrigin()]);
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">④ 안내문 작성</h2>
      <NoticeEditor
        examId={examId}
        exam={{ title: exam.title, starts_at: exam.starts_at, ends_at: exam.ends_at, time_limit_min: exam.time_limit_min }}
        notices={notices}
        recipients={candidates.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, token: c.access_token }))}
        origin={origin}
      />
    </section>
  );
}
