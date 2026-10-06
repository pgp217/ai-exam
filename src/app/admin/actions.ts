"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, signIn, signOut } from "@/lib/admin/auth";
import { generateFeedback, saveReviewedFeedback } from "@/lib/feedback/service";
import { confirmGrading, gradeAttemptEssays } from "@/lib/grading/service";

export interface FormState {
  ok: boolean;
  message: string | null;
  email?: string; // 로그인 실패 시 입력한 이메일을 되돌려준다 (React 는 액션 뒤 폼 입력값을 초기화한다)
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { ok: false, message: "이메일과 비밀번호를 입력해 주세요.", email };
  const r = await signIn(email, password);
  if (!r.ok) return { ok: false, message: r.error, email };
  redirect("/admin/grading");
}

export async function logoutAction() {
  await signOut();
  redirect("/admin/login");
}

export async function runAiGradingAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const attemptId = String(form.get("attemptId") ?? "");
  const itemId = form.get("itemId") ? String(form.get("itemId")) : undefined;
  const run = await gradeAttemptEssays(attemptId, { force: form.get("force") === "1", itemIds: itemId ? [itemId] : undefined });
  refresh();
  if (run.failed.length > 0) {
    return { ok: false, message: `AI 채점 실패: ${run.failed.map((f) => `${f.itemId} (${f.error})`).join(", ")}` };
  }
  return { ok: true, message: run.graded.length > 0 ? `${run.graded.join(", ")} AI 채점을 마쳤습니다.` : "새로 채점할 문항이 없습니다." };
}

export async function confirmGradingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const scores: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("score:")) scores[k.slice(6)] = v;
  const r = await confirmGrading({
    attemptId: String(form.get("attemptId") ?? ""),
    itemId: String(form.get("itemId") ?? ""),
    graderId: admin.id,
    scores,
    reason: String(form.get("reason") ?? ""),
  });
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: r.complete ? "확정했습니다. 세 문항이 모두 확정되어 결과를 계산했습니다." : "확정했습니다." };
}

export async function saveFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const titles = form.getAll("title").map(String);
  const details = form.getAll("detail").map(String);
  const chapters = form.getAll("chapter").map(String);
  const approve = form.get("intent") === "approve";
  const r = await saveReviewedFeedback({
    attemptId: String(form.get("attemptId") ?? ""),
    adminId: admin.id,
    summary: String(form.get("summary") ?? ""),
    actions: titles.map((title, i) => ({ title, detail: details[i] ?? "", chapter: chapters[i] || null })),
    approve,
  });
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: approve ? "승인했습니다. 응시자 리포트에 공개됩니다." : "임시 저장했습니다 (아직 공개되지 않음)." };
}

export async function regenerateFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const r = await generateFeedback(String(form.get("attemptId") ?? ""), { force: true });
  if (!r.ok) return { ok: false, message: r.error };
  refresh();
  return { ok: true, message: "새 초안을 만들었습니다. 확인 후 승인해 주세요." };
}
