"use client";

import { useActionState, useRef, useState } from "react";
import type { NoticeTemplate } from "@/lib/attempt/types";
import { LMS_LIMIT, RECOMMENDED, SMS_LIMIT, VARIABLES, noticeVars, renderTemplate, smsBytes, smsKind, type Channel } from "@/lib/exams/notice";
import { saveNoticeAction, type ExamFormState } from "../../actions";
import { FormMessage, inputClass } from "../../fields";

const initial: ExamFormState = { ok: false, message: null };

interface Props {
  examId: string;
  exam: { title: string; starts_at: string; ends_at: string; time_limit_min: number };
  notices: NoticeTemplate[];
  recipients: { id: string; name: string; email: string | null; phone: string | null; token: string }[];
  origin: string;
}

export default function NoticeEditor(props: Props) {
  const [channel, setChannel] = useState<Channel>("email");
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="안내 채널" className="flex gap-2">
        {(["email", "sms"] as const).map((c) => (
          <button
            key={c} type="button" role="tab" aria-selected={channel === c} onClick={() => setChannel(c)}
            className={`rounded-full border px-4 py-1.5 text-sm ${channel === c ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            {c === "email" ? "메일" : "문자"}
            {props.notices.some((n) => n.channel === c) && <span className="ml-1 text-emerald-500">●</span>}
          </button>
        ))}
      </div>
      {/* 채널마다 따로 상태를 갖도록 key 로 나눈다 */}
      <ChannelEditor key={channel} channel={channel} {...props} />
    </div>
  );
}

function ChannelEditor({ channel, examId, exam, notices, recipients, origin }: Props & { channel: Channel }) {
  const saved = notices.find((n) => n.channel === channel);
  const [subject, setSubject] = useState(saved?.subject ?? RECOMMENDED[channel].subject);
  const [body, setBody] = useState(saved?.body ?? RECOMMENDED[channel].body);
  const [who, setWho] = useState(recipients[0]?.id ?? "");
  const [state, action, pending] = useActionState(saveNoticeAction, initial);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const r = recipients.find((x) => x.id === who);
  const vars = noticeVars({ name: r?.name ?? "홍길동", title: exam.title, starts_at: exam.starts_at, ends_at: exam.ends_at, time_limit_min: exam.time_limit_min, url: r ? `${origin}/t/${r.token}` : `${origin}/t/(개인 링크)` });
  const subj = renderTemplate(subject, vars);
  const text = renderTemplate(body, vars);
  const unknown = [...new Set([...subj.unknown, ...text.unknown])];
  const bytes = smsBytes(text.text);
  // 서버는 앞뒤 공백을 지우고 저장하므로 비교도 같은 기준으로 한다
  const dirty = subject.trim() !== (saved?.subject ?? "").trim() || body.trim() !== (saved?.body ?? "").trim();

  function insert(token: string) {
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + token);
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const next = body.slice(0, s) + token + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="space-y-3">
        <input type="hidden" name="examId" value={examId} />
        <input type="hidden" name="channel" value={channel} />
        {channel === "email" && (
          <label className="block text-sm">
            <span className="font-medium">제목</span>
            <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={`${inputClass} mt-1`} />
          </label>
        )}
        <div className="text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-medium">본문</span>
            {VARIABLES.map((v) => (
              <button key={v.token} type="button" onClick={() => insert(v.token)} title={v.desc} className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs dark:border-zinc-700">{v.token}</button>
            ))}
          </div>
          <textarea ref={bodyRef} name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={channel === "email" ? 14 : 5} maxLength={5000} className={`${inputClass} mt-1 font-mono text-sm`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{pending ? "저장 중…" : "저장"}</button>
          <button type="button" onClick={() => { setSubject(RECOMMENDED[channel].subject); setBody(RECOMMENDED[channel].body); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">추천 서식 넣기</button>
          {dirty && !pending && <span className="text-xs text-amber-700">저장하지 않은 변경이 있습니다</span>}
          <FormMessage ok={state.ok} message={state.message} />
        </div>
        {unknown.length > 0 && <p className="text-xs text-red-600">알 수 없는 변수: {unknown.join(", ")} — 위 버튼의 변수만 바뀝니다.</p>}
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">미리보기</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="미리볼 대상자" className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950">
            {recipients.length === 0 && <option value="">(대상자 없음 · 예시 이름)</option>}
            {recipients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {r && <span className="text-xs text-zinc-500">받는 곳: {(channel === "email" ? r.email : r.phone) ?? "없음"}</span>}
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          {channel === "email" && <p className="mb-3 border-b border-zinc-200 pb-2 font-semibold dark:border-zinc-800">{subj.text}</p>}
          <p className="whitespace-pre-wrap break-all leading-relaxed">{text.text}</p>
        </div>
        {channel === "sms" && (
          <p className={`text-xs ${smsKind(bytes) === "초과" ? "text-red-600" : "text-zinc-500"}`}>
            {bytes}바이트 · {smsKind(bytes)} (SMS {SMS_LIMIT}바이트, LMS {LMS_LIMIT}바이트까지 · 한글 2바이트, 영문·숫자 1바이트 기준, 이 대상자 기준)
          </p>
        )}
        <a href={`/admin/exams/${examId}/notice/export?channel=${channel}`} className={`inline-block text-sm underline ${saved ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!saved}>
          저장된 {channel === "email" ? "메일" : "문자"} 안내문을 대상자별로 내려받기 (.csv)
        </a>
        <p className="text-xs text-zinc-500">이 앱은 메일·문자를 직접 보내지 않습니다. 내려받은 파일을 사내 발송 도구에 넣어 보내세요.</p>
      </div>
    </div>
  );
}
