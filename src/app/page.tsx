import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "@/lib/exam/items";
import { MID_FACTORS, TOP_FACTORS } from "@/lib/exam/factors";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <header>
        <p className="text-sm text-zinc-500">genai-book 기반</p>
        <h1 className="text-3xl font-bold">신입사원 AI 역량 시험</h1>
        <p className="mt-2 text-zinc-600">
          객관식 {CHOICE_ITEMS.length}문항 · 자기평가 {SELF_ITEMS.length}문항 · 서술형 {ESSAY_ITEMS.length}문항
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {TOP_FACTORS.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-200 p-4">
            <h2 className="font-semibold">{t.name}</h2>
            <p className="mt-1 text-sm text-zinc-600">{t.desc}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {MID_FACTORS.filter((m) => m.top === t.id).map((m) => (
                <li key={m.id}>· {m.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <p className="text-sm text-zinc-500">응시 화면과 관리자 화면은 다음 단계에서 추가됩니다.</p>
    </main>
  );
}
