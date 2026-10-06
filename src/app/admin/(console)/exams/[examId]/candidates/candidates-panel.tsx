"use client";

import { useActionState, useMemo, useState } from "react";
import type { AdminCandidate } from "@/lib/attempt/types";
import { withoutRow } from "@/lib/exams/candidates";
import type { ImportPreview } from "@/lib/exams/service";
import { addCandidateAction, confirmImportAction, deleteCandidateAction, previewImportAction, type ExamFormState } from "../../actions";
import { FormMessage, inputClass } from "../../fields";

const initial: ExamFormState = { ok: false, message: null };
const STATUS: Record<string, string> = { none: "미응시", in_progress: "응시 중", submitted: "제출", grading: "채점 중", complete: "채점 완료" };

export default function CandidatesPanel({ examId, candidates, origin }: { examId: string; candidates: AdminCandidate[]; origin: string }) {
  return (
    <div className="space-y-6">
      <Upload examId={examId} />
      <AddOne examId={examId} />
      <List examId={examId} candidates={candidates} origin={origin} />
    </div>
  );
}

// ── 엑셀 업로드 ─────────────────────────────────────────
function Upload({ examId }: { examId: string }) {
  const [state, action, pending] = useActionState(previewImportAction, initial);
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800" aria-labelledby="upload-title">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="upload-title" className="font-semibold">엑셀로 등록</h3>
        {/* 페이지 이동이 아니라 Route Handler 의 파일 내려받기라 <Link> 대신 <a download> 를 쓴다 */}
        <a href="/admin/exams/candidates-template" download className="text-sm underline">양식 내려받기 (.xlsx)</a>
      </div>
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="examId" value={examId} />
        <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="text-sm" aria-label="대상자 엑셀 파일" />
        <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700">
          {pending ? "읽는 중…" : "파일 확인"}
        </button>
        <FormMessage ok={state.ok} message={state.message} />
      </form>
      <p className="text-xs text-zinc-500">사번·이름은 필수입니다. 이미 등록된 사번은 정보만 바뀌고 응시 링크는 그대로입니다. 확인 단계에서는 아직 저장되지 않습니다.</p>
      {state.preview && <Preview key={state.nonce} examId={examId} preview={state.preview} />}
    </section>
  );
}

function Preview({ examId, preview }: { examId: string; preview: ImportPreview }) {
  const [state, action, pending] = useActionState(confirmImportAction, initial);
  if (state.ok) return <FormMessage ok message={state.message} />;
  const rows = preview.valid.map(withoutRow);
  return (
    <div className="space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      <p className="text-sm">
        정상 <strong>{preview.valid.length}명</strong>
        {preview.existing > 0 && <> (이 중 {preview.existing}명은 이미 등록된 사번이라 정보가 바뀝니다)</>}
        {preview.errors.length > 0 && <> · <span className="text-red-600">오류 {preview.errors.length}행</span></>}
      </p>
      {preview.errors.length > 0 && (
        <div className="max-h-40 overflow-auto rounded border border-red-200 bg-white p-2 text-xs dark:border-red-900 dark:bg-zinc-950">
          <p className="mb-1 font-medium text-red-600">오류가 있는 행은 등록하지 않습니다. 엑셀을 고쳐 다시 올리거나, 정상 행만 등록할 수 있습니다.</p>
          <ul>{preview.errors.map((e) => <li key={e.row}>{e.row}행: {e.messages.join(", ")}</li>)}</ul>
        </div>
      )}
      {preview.valid.length > 0 && (
        <>
          <div className="max-h-60 overflow-auto rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-100 text-left dark:bg-zinc-900">
                <tr>{["행", "사번", "이름", "소속", "기수", "이메일", "휴대폰", "입사일"].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.valid.map((c) => (
                  <tr key={c.row} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-2 py-1 text-zinc-400">{c.row}</td><td className="px-2 py-1">{c.employee_no}</td><td className="px-2 py-1">{c.name}</td>
                    <td className="px-2 py-1">{c.department ?? ""}</td><td className="px-2 py-1">{c.cohort ?? ""}</td><td className="px-2 py-1">{c.email ?? ""}</td>
                    <td className="px-2 py-1">{c.phone ?? ""}</td><td className="px-2 py-1">{c.joined_at ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            <button type="submit" disabled={pending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
              {pending ? "등록 중…" : `${preview.valid.length}명 등록`}
            </button>
            <FormMessage ok={state.ok} message={state.message} />
          </form>
        </>
      )}
    </div>
  );
}

// ── 한 명 추가 ─────────────────────────────────────────
function AddOne({ examId }: { examId: string }) {
  const [state, action, pending] = useActionState(addCandidateAction, initial);
  const fields: [string, string, string?][] = [
    ["employee_no", "사번*"], ["name", "이름*"], ["department", "소속"], ["cohort", "기수"],
    ["email", "이메일", "email"], ["phone", "휴대폰"], ["joined_at", "입사일", "date"],
  ];
  return (
    <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <summary className="cursor-pointer font-semibold">한 명씩 추가</summary>
      <form action={action} className="mt-3 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="examId" value={examId} />
        {fields.map(([name, label, type]) => (
          <label key={name} className="text-xs">
            <span className="text-zinc-500">{label}</span>
            <input name={name} type={type ?? "text"} required={label.endsWith("*")} defaultValue={state.ok ? "" : state.values?.[name]} className={`${inputClass} mt-0.5 py-1.5 text-sm`} />
          </label>
        ))}
        <div className="flex items-end gap-2">
          <button type="submit" disabled={pending} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700">추가</button>
        </div>
        <div className="sm:col-span-4"><FormMessage ok={state.ok} message={state.message} /></div>
      </form>
    </details>
  );
}

// ── 대상자 목록 ─────────────────────────────────────────
function List({ examId, candidates, origin }: { examId: string; candidates: AdminCandidate[]; origin: string }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [cohort, setCohort] = useState("");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [delState, del, deleting] = useActionState(deleteCandidateAction, initial);

  const opts = (pick: (c: AdminCandidate) => string | null) => [...new Set(candidates.map(pick).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "ko"));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates.filter(
      (c) =>
        (!s || c.name.toLowerCase().includes(s) || c.employee_no.toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s)) &&
        (!dept || c.department === dept) && (!cohort || c.cohort === cohort) && (!status || (c.attemptStatus ?? "none") === status),
    );
  }, [candidates, q, dept, cohort, status]);

  async function copy(c: AdminCandidate) {
    await navigator.clipboard.writeText(`${origin}/t/${c.access_token}`);
    setCopied(c.id);
  }

  const select = (label: string, value: string, set: (v: string) => void, options: [string, string][]) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
        <option value="">전체</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <section className="space-y-3" aria-labelledby="list-title">
      <div className="flex flex-wrap items-end gap-2">
        <h3 id="list-title" className="mr-2 font-semibold">대상자 {candidates.length}명</h3>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-zinc-500">검색</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·사번·이메일" className="w-40 rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        {select("소속", dept, setDept, opts((c) => c.department).map((v) => [v, v]))}
        {select("기수", cohort, setCohort, opts((c) => c.cohort).map((v) => [v, v]))}
        {select("응시 상태", status, setStatus, Object.entries(STATUS))}
        <span className="pb-1.5 text-xs text-zinc-500">{rows.length}명 표시</span>
      </div>
      <FormMessage ok={delState.ok} message={delState.message} />
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900">
            <tr>{["사번", "이름", "소속", "기수", "이메일", "휴대폰", "응시", "응시 링크", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 tabular-nums">{c.employee_no}</td>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-zinc-600">{c.department ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">{c.cohort ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">{c.email ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{c.phone ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{STATUS[c.attemptStatus ?? "none"]}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => copy(c)} className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700">
                    {copied === c.id ? "복사됨" : "링크 복사"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  {!c.attemptStatus && (
                    <form action={del} onSubmit={(e) => { if (!confirm(`${c.name}(${c.employee_no})을 삭제할까요?`)) e.preventDefault(); }}>
                      <input type="hidden" name="examId" value={examId} />
                      <input type="hidden" name="candidateId" value={c.id} />
                      <button type="submit" disabled={deleting} className="text-xs text-red-600 hover:underline disabled:opacity-50">삭제</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
