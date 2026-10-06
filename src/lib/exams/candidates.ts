// 대상자 엑셀 행 검증 (순수 함수). 양식의 머리글은 한글, 영문 이름도 받는다.

export interface CandidateInput {
  employee_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  cohort: string | null;
  joined_at: string | null; // YYYY-MM-DD
}

export const COLUMNS: { key: keyof CandidateInput; label: string; required?: boolean; example: string; aliases: string[] }[] = [
  { key: "employee_no", label: "사번", required: true, example: "N-2026-001", aliases: ["사원번호", "employee_no", "employee no"] },
  { key: "name", label: "이름", required: true, example: "홍길동", aliases: ["성명", "name"] },
  { key: "email", label: "이메일", example: "gildong@example.com", aliases: ["메일", "email", "e-mail"] },
  { key: "phone", label: "휴대폰", example: "010-1234-5678", aliases: ["휴대전화", "전화번호", "연락처", "phone", "mobile"] },
  { key: "department", label: "소속", example: "경영지원팀", aliases: ["부서", "팀", "department"] },
  { key: "cohort", label: "기수", example: "2026-하반기", aliases: ["입사기수", "cohort"] },
  { key: "joined_at", label: "입사일", example: "2026-09-01", aliases: ["입사일자", "joined_at", "join date"] },
];

export const MAX_ROWS = 2000;

const norm = (s: string) => s.replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();

/** 머리글 → 필드. 모르는 머리글은 무시한다 */
export function mapHeaders(headers: string[]): (keyof CandidateInput | null)[] {
  return headers.map((h) => {
    const n = norm(h);
    return COLUMNS.find((c) => norm(c.label) === n || c.aliases.some((a) => norm(a) === n))?.key ?? null;
  });
}

export interface RowError {
  row: number; // 엑셀 행 번호 (머리글이 1행)
  messages: string[];
}

export interface ParsedCandidates {
  valid: (CandidateInput & { row: number })[];
  errors: RowError[];
  missingColumns: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (!/^01\d{8,9}$/.test(digits)) return null;
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function normalizeDate(v: string): string | null {
  const m = v.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** 머리글 + 데이터 행(문자열)을 검증한다. 같은 파일 안 사번 중복도 오류로 본다 */
export function parseCandidateRows(headers: string[], rows: string[][]): ParsedCandidates {
  const keys = mapHeaders(headers);
  const missingColumns = COLUMNS.filter((c) => c.required && !keys.includes(c.key)).map((c) => c.label);
  if (missingColumns.length) return { valid: [], errors: [], missingColumns };

  const valid: ParsedCandidates["valid"] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  rows.forEach((cells, i) => {
    const row = i + 2;
    const get = (k: keyof CandidateInput) => {
      const idx = keys.indexOf(k);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };
    if (cells.every((c) => !c?.trim())) return; // 빈 행
    const messages: string[] = [];
    const employee_no = get("employee_no");
    const name = get("name");
    if (!employee_no) messages.push("사번이 없습니다");
    else if (employee_no.length > 50) messages.push("사번이 너무 깁니다");
    if (!name) messages.push("이름이 없습니다");
    else if (name.length > 50) messages.push("이름이 너무 깁니다");
    if (employee_no && seen.has(employee_no)) messages.push(`${seen.get(employee_no)}행과 사번이 같습니다`);

    const emailRaw = get("email");
    if (emailRaw && !EMAIL.test(emailRaw)) messages.push("이메일 형식이 아닙니다");
    const phoneRaw = get("phone");
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) messages.push("휴대폰 번호 형식이 아닙니다 (예: 010-1234-5678)");
    const dateRaw = get("joined_at");
    const joined_at = dateRaw ? normalizeDate(dateRaw) : null;
    if (dateRaw && !joined_at) messages.push("입사일 형식이 아닙니다 (예: 2026-09-01)");

    if (messages.length) {
      errors.push({ row, messages });
    } else {
      seen.set(employee_no, row);
      valid.push({
        row, employee_no, name,
        email: emailRaw || null, phone,
        department: get("department") || null, cohort: get("cohort") || null, joined_at,
      });
    }
    if (employee_no && !seen.has(employee_no)) seen.set(employee_no, row);
  });

  return { valid, errors, missingColumns };
}

/** 확정 요청으로 다시 들어온 행을 서버에서 한 번 더 검증한다 (클라이언트 값을 믿지 않는다) */
export function revalidate(rows: unknown): CandidateInput[] | null {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) return null;
  const headers = COLUMNS.map((c) => c.label);
  const cells = rows.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return COLUMNS.map((c) => (o[c.key] == null ? "" : String(o[c.key])));
  });
  const parsed = parseCandidateRows(headers, cells);
  if (parsed.errors.length || parsed.missingColumns.length) return null;
  return parsed.valid.map(withoutRow);
}

/** 미리보기용 행 번호를 뺀 등록 값 */
export function withoutRow(c: CandidateInput & { row?: number }): CandidateInput {
  return { employee_no: c.employee_no, name: c.name, email: c.email, phone: c.phone, department: c.department, cohort: c.cohort, joined_at: c.joined_at };
}
