import { redirect } from "next/navigation";

export default async function ExamHome({ params }: PageProps<"/admin/exams/[examId]">) {
  const { examId } = await params;
  redirect(`/admin/exams/${examId}/basic`);
}
