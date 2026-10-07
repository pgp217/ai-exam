import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "@/lib/exam/items";
import { MID_FACTORS, TOP_FACTORS } from "@/lib/exam/factors";
import { storeMode } from "@/lib/attempt/service";

export default function Home() {
  const demo = process.env.NODE_ENV !== "production" && storeMode() === "memory";
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <header>
        <p className="text-sm text-zinc-500">ai-exam</p>
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
      <p className="text-sm text-zinc-500">
        응시자는 안내받은 개인별 응시 링크로 들어옵니다. 담당자는{" "}
        <a href="/admin/login" className="underline">관리자 로그인</a>으로 서술형 채점을 검토합니다.
      </p>
      {demo && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          개발용 메모리 저장소로 실행 중입니다. 데모 응시 링크:{" "}
          {["demo", "demo2", "demo3"].map((t) => (
            <a key={t} href={`/t/${t}`} className="mr-2 underline">/t/{t}</a>
          ))}
        </p>
      )}
    </main>
  );
}
