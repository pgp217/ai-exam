import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CHOICE_ITEMS, ESSAY_ITEMS, SELF_ITEMS } from "@/lib/exam/items";
import { loadSession, type PublicExam } from "@/lib/attempt/service";
import ExamRunner from "./exam-runner";
import StartForm from "./start-form";

// 마감 지난 응시를 열면 자동 제출하고 after() 로 AI 채점을 시작한다
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "응시 | 신입사원 AI 역량 시험",
  robots: { index: false, follow: false },
};

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

export default async function TakeExamPage({ params }: PageProps<"/t/[token]">) {
  const { token } = await params;
  const view = await loadSession(token);

  if (view.state === "not-found") notFound();

  if (view.state === "in-progress") {
    return (
      <ExamRunner
        token={token}
        title={view.exam.title}
        candidateName={view.candidateName}
        deadline={view.deadline}
        serverNow={view.now}
        initial={view.responses}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header>
        <p className="text-sm text-zinc-500">{view.candidateName} 님</p>
        <h1 className="mt-1 text-2xl font-bold">{view.exam.title}</h1>
      </header>

      {view.state === "intro" && (
        <>
          <Overview exam={view.exam} />
          <StartForm token={token} />
        </>
      )}

      {view.state === "unavailable" && (
        <Notice>
          {view.reason === "not-yet" && <>응시 기간 전입니다. {fmt.format(new Date(view.exam.starts_at))}부터 응시할 수 있습니다.</>}
          {view.reason === "ended" && <>응시 기간이 끝났습니다. ({fmt.format(new Date(view.exam.ends_at))} 마감)</>}
          {view.reason === "closed" && <>지금은 응시할 수 없는 시험입니다. 담당자에게 문의해 주세요.</>}
        </Notice>
      )}

      {view.state === "submitted" && (
        <Notice>
          <p className="font-semibold">답안이 제출되었습니다. 수고하셨습니다.</p>
          {view.submittedAt && <p className="mt-1 text-sm text-zinc-600">제출 시각: {fmt.format(new Date(view.submittedAt))}</p>}
          <p className="mt-3 text-sm text-zinc-600">
            {view.exam.show_result
              ? "서술형 채점이 확정되면 이 링크에서 결과 리포트를 볼 수 있습니다."
              : "결과는 담당자를 통해 안내됩니다."}
          </p>
        </Notice>
      )}
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">{children}</div>;
}

function Overview({ exam }: { exam: PublicExam }) {
  return (
    <section className="space-y-4">
      {exam.intro_text && <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{exam.intro_text}</p>}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="제한 시간" value={`${exam.time_limit_min}분`} />
        <Stat label="자기평가" value={`${SELF_ITEMS.length}문항`} />
        <Stat label="객관식" value={`${CHOICE_ITEMS.length}문항`} />
        <Stat label="서술형" value={`${ESSAY_ITEMS.length}문항`} />
      </dl>
      <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>시작하면 타이머가 바로 시작되고, 창을 닫아도 멈추지 않습니다. 같은 링크로 다시 들어오면 이어서 풀 수 있습니다.</li>
        <li>답은 자동으로 임시 저장됩니다. 제한 시간이 끝나면 그때까지 저장된 답이 자동 제출됩니다.</li>
        <li>자기평가는 점수에 반영되지 않습니다. 평소 모습 그대로 답해 주세요.</li>
        <li>외부 AI나 다른 사람의 도움 없이 직접 답해 주세요. 응답 시간과 서술형 붙여넣기 여부가 기록됩니다.</li>
        <li>응시는 1회만 가능하며, 제출한 뒤에는 답을 고칠 수 없습니다.</li>
      </ul>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
