"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import type { FieldErrors } from "@/lib/exams/form";
import type { Channel } from "@/lib/exams/notice";
import {
  addCandidate, clearRetakeScores, createExam, grantRetake, importCandidates, previewCandidateFile, removeCandidate, saveNotice, setStatus,
  updateBasic, updateSite, type ImportPreview,
} from "@/lib/exams/service";

export interface ExamFormState {
  ok: boolean;
  message: string | null;
  fields?: FieldErrors;
  preview?: ImportPreview;
  nonce?: string; // 미리보기마다 새 값 (확정 화면 상태를 초기화하는 key)
  values?: Record<string, string>; // 실패 시 입력값을 되돌려준다 (React 는 액션 뒤 폼 입력값을 초기화한다)
}

const echo = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]));
const BASIC = ["title", "starts", "ends"];
const SITE = ["time_limit_min", "intro_text", "show_result"];
const CANDIDATE = ["employee_no", "name", "email", "phone", "department", "cohort", "joined_at"];

const str = (form: FormData, key: string) => (form.get(key) == null ? undefined : String(form.get(key)));

export async function createExamAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  const admin = await requireAdmin();
  const r = await createExam({ title: str(form, "title"), starts: str(form, "starts"), ends: str(form, "ends") }, admin.id);
  if (!r.ok) return { ok: false, message: r.error, fields: r.fields, values: echo(form, BASIC) };
  redirect(`/admin/exams/${r.value}/site`);
}

export async function saveBasicAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const r = await updateBasic(String(form.get("examId")), { title: str(form, "title"), starts: str(form, "starts"), ends: str(form, "ends") });
  if (!r.ok) return { ok: false, message: r.error, fields: r.fields, values: echo(form, BASIC) };
  refresh();
  return { ok: true, message: "저장했습니다." };
}

export async function saveSiteAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const r = await updateSite(String(form.get("examId")), {
    time_limit_min: str(form, "time_limit_min"), intro_text: str(form, "intro_text"), show_result: str(form, "show_result") ?? null,
  });
  if (!r.ok) return { ok: false, message: r.error, fields: r.fields, values: echo(form, SITE) };
  refresh();
  return { ok: true, message: "저장했습니다." };
}

export async function setStatusAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const status = String(form.get("status"));
  if (status !== "open" && status !== "closed" && status !== "draft") return { ok: false, message: "알 수 없는 상태입니다." };
  const r = await setStatus(String(form.get("examId")), status);
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: status === "open" ? "시험을 열었습니다. 응시 링크로 응시할 수 있습니다." : status === "closed" ? "시험을 마감했습니다." : "초안으로 되돌렸습니다." };
}

export async function previewImportAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const file = form.get("file");
  const r = await previewCandidateFile(String(form.get("examId")), file instanceof File ? file : null);
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, message: null, preview: r.value, nonce: crypto.randomUUID() };
}

export async function confirmImportAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  let rows: unknown;
  try {
    rows = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    return { ok: false, message: "등록할 대상자 정보가 올바르지 않습니다." };
  }
  const r = await importCandidates(String(form.get("examId")), rows);
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: `${r.value.inserted}명을 새로 등록하고 ${r.value.updated}명의 정보를 바꿨습니다.` };
}

export async function addCandidateAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const r = await addCandidate(String(form.get("examId")), echo(form, CANDIDATE));
  if (!r.ok) return { ok: false, message: r.error, values: echo(form, CANDIDATE) };
  refresh();
  return { ok: true, message: r.value.updated ? "이미 있는 사번이라 정보를 바꿨습니다." : "등록했습니다." };
}

export async function deleteCandidateAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const r = await removeCandidate(String(form.get("examId")), String(form.get("candidateId")));
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: "삭제했습니다." };
}

const RETAKE = ["reason", "until"];

export async function grantRetakeAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  const admin = await requireAdmin();
  const r = await grantRetake(String(form.get("examId")), String(form.get("candidateId")), { reason: str(form, "reason"), until: str(form, "until") }, admin.id);
  if (!r.ok) return { ok: false, message: r.error, fields: r.fields, values: echo(form, RETAKE) };
  refresh();
  return { ok: true, message: "재응시를 허용했습니다. 이전 응시는 보관했고, 같은 응시 링크로 처음부터 다시 응시할 수 있습니다." };
}

export async function clearRetakeScoresAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const r = await clearRetakeScores(String(form.get("examId")), String(form.get("candidateId")), String(form.get("archiveId")));
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: "이전 응시의 AI 채점과 확정 점수를 지웠습니다. 응답 원문과 재응시 사유는 남아 있습니다." };
}

export async function saveNoticeAction(_prev: ExamFormState, form: FormData): Promise<ExamFormState> {
  await requireAdmin();
  const channel = String(form.get("channel")) as Channel;
  if (channel !== "email" && channel !== "sms") return { ok: false, message: "알 수 없는 채널입니다." };
  const r = await saveNotice(String(form.get("examId")), channel, String(form.get("subject") ?? ""), String(form.get("body") ?? ""));
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: "저장했습니다." };
}
