// 시험 생성·수정 입력 검증과 날짜 처리 (순수 함수). 관리자는 한국 시간(KST)으로 입력한다.

export const LIMITS = { titleMax: 100, introMax: 2000, minLimit: 5, maxLimit: 240 };

const KST_OFFSET_MS = 9 * 3600_000;

/** <input type="datetime-local"> 값(KST, "2026-10-06T09:00")을 ISO 문자열로 */
export function kstInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}:00+09:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** ISO 문자열을 datetime-local 입력값(KST)으로 */
export function isoToKstInput(iso: string): string {
  return new Date(Date.parse(iso) + KST_OFFSET_MS).toISOString().slice(0, 16);
}

export type FieldErrors = Record<string, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export interface BasicInput {
  title: string;
  starts_at: string;
  ends_at: string;
}

export function parseBasic(f: { title?: string; starts?: string; ends?: string }): Parsed<BasicInput> {
  const errors: FieldErrors = {};
  const title = (f.title ?? "").trim();
  if (!title) errors.title = "시험명을 입력해 주세요.";
  else if (title.length > LIMITS.titleMax) errors.title = `시험명은 ${LIMITS.titleMax}자 이내로 입력해 주세요.`;
  const starts_at = kstInputToIso(f.starts ?? "");
  const ends_at = kstInputToIso(f.ends ?? "");
  if (!starts_at) errors.starts = "응시 시작 일시를 입력해 주세요.";
  if (!ends_at) errors.ends = "응시 마감 일시를 입력해 주세요.";
  if (starts_at && ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) errors.ends = "마감은 시작보다 뒤여야 합니다.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { title, starts_at: starts_at!, ends_at: ends_at! } };
}

export interface SiteInput {
  time_limit_min: number;
  intro_text: string;
  show_result: boolean;
  collect_survey: boolean;
}

const checked = (v: string | null | undefined) => v === "on" || v === "true";

export function parseSite(f: { time_limit_min?: string; intro_text?: string; show_result?: string | null; collect_survey?: string | null }): Parsed<SiteInput> {
  const errors: FieldErrors = {};
  const limit = Number(f.time_limit_min);
  if (!Number.isInteger(limit) || limit < LIMITS.minLimit || limit > LIMITS.maxLimit) {
    errors.time_limit_min = `제한 시간은 ${LIMITS.minLimit}~${LIMITS.maxLimit}분 사이의 정수로 입력해 주세요.`;
  }
  const intro_text = (f.intro_text ?? "").replace(/\r\n?/g, "\n").trim(); // 폼 전송 시 \r\n 으로 바뀐 줄바꿈을 되돌린다
  if (intro_text.length > LIMITS.introMax) errors.intro_text = `안내 문구는 ${LIMITS.introMax}자 이내로 입력해 주세요.`;
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { time_limit_min: limit, intro_text, show_result: checked(f.show_result), collect_survey: checked(f.collect_survey) } };
}

const DAY_MS = 24 * 3600_000;

/** KST 달력 날짜 기준 차이(일) */
function kstDayDiff(from: number, to: number): number {
  const day = (t: number) => Math.floor((t + KST_OFFSET_MS) / DAY_MS);
  return day(to) - day(from);
}

export interface DDay {
  label: string;
  phase: "upcoming" | "running" | "ended";
}

/** 응시 기간 기준 D-day. 시작 전: "D-3", 진행 중: "진행 중 · 마감 D-2", 끝: "마감" */
export function dDay(exam: { starts_at: string; ends_at: string }, now: number = Date.now()): DDay {
  const start = Date.parse(exam.starts_at);
  const end = Date.parse(exam.ends_at);
  if (now < start) {
    const d = kstDayDiff(now, start);
    return { label: d === 0 ? "D-day" : `D-${d}`, phase: "upcoming" };
  }
  if (now < end) {
    const d = kstDayDiff(now, end);
    return { label: d === 0 ? "진행 중 · 오늘 마감" : `진행 중 · 마감 D-${d}`, phase: "running" };
  }
  return { label: "마감", phase: "ended" };
}
