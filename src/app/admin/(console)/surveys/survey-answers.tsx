import { SURVEY_QUESTIONS } from "@/lib/survey/survey";
import type { SurveyRow } from "@/lib/attempt/types";

/** 한 사람의 설문 응답 (결과 리포트 화면·설문 목록 공용) */
export default function SurveyAnswers({ survey }: { survey: Pick<SurveyRow, "answers" | "had_issue" | "issue" | "comment"> }) {
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto]">
        {SURVEY_QUESTIONS.map((q) => (
          <div key={q.id} className="contents">
            <dt className="text-zinc-600 dark:text-zinc-400">{q.text}</dt>
            <dd className="tabular-nums">
              <strong>{survey.answers[q.id]}</strong>
              <span className="text-zinc-500"> / 5 ({q.low} 1 · {q.high} 5)</span>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        오류·불편: {survey.had_issue ? <span className="font-medium text-red-600">있었음</span> : "없었음"}
        {survey.issue && <span className="mt-1 block whitespace-pre-wrap rounded bg-red-50 p-2 text-red-900 dark:bg-red-950 dark:text-red-200">{survey.issue}</span>}
      </p>
      {survey.comment && <p className="whitespace-pre-wrap rounded bg-zinc-50 p-2 dark:bg-zinc-900">{survey.comment}</p>}
    </div>
  );
}
