import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { isoToKstInput } from "@/lib/exams/form";
import BasicForm from "../basic-form";

export default async function NewExamPage() {
  await requireAdmin();
  // 기본값: 다음 날 09:00 ~ 7일 뒤 18:00 (한국 시간)
  const today = isoToKstInput(new Date().toISOString()).slice(0, 10);
  const day = (n: number) => isoToKstInput(new Date(Date.parse(`${today}T00:00:00+09:00`) + n * 86400_000).toISOString()).slice(0, 10);
  return (
    <div className="space-y-5">
      <Link href="/admin/exams" className="text-sm text-zinc-500 hover:underline">← 시험 관리</Link>
      <div>
        <h1 className="text-2xl font-bold">새 시험 만들기</h1>
        <p className="mt-1 text-sm text-zinc-500">① 기본 설정 → ② 응시 사이트 → ③ 대상자 → ④ 안내문 순서로 진행합니다. 만든 뒤에는 초안 상태로 저장되고, 모든 단계를 마치면 시험을 엽니다.</p>
      </div>
      <BasicForm values={{ title: "", starts: `${day(1)}T09:00`, ends: `${day(7)}T18:00` }} />
    </div>
  );
}
