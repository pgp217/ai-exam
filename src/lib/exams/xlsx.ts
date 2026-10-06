// 대상자 엑셀 양식 만들기와 업로드 파일 읽기 (서버 전용)
import "server-only";

import ExcelJS from "exceljs";
import { COLUMNS, MAX_ROWS } from "./candidates";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("대상자");
  ws.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.label}*` : c.label, key: c.key, width: Math.max(12, c.example.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, c.example])));
  // 사번·휴대폰·입사일이 숫자/날짜로 바뀌지 않도록 글자 형식으로 둔다
  for (let col = 1; col <= COLUMNS.length; col++) ws.getColumn(col).numFmt = "@";
  const help = wb.addWorksheet("작성 방법");
  [
    "1. '대상자' 시트의 2행(예시)을 지우고 한 줄에 한 명씩 입력합니다.",
    "2. * 표시 항목(사번, 이름)은 필수입니다. 같은 시험 안에서 사번은 겹치면 안 됩니다.",
    "3. 이미 등록된 사번을 다시 올리면 이름·연락처 등 정보가 새 값으로 바뀝니다. 응시 링크는 그대로 유지됩니다.",
    "4. 휴대폰은 010-1234-5678, 입사일은 2026-09-01 형식으로 입력합니다.",
    `5. 한 번에 최대 ${MAX_ROWS}명까지 올릴 수 있습니다.`,
  ].forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 90;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // 하이퍼링크
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result == null ? "" : cellText(v.result as ExcelJS.CellValue); // 수식
    return "";
  }
  return String(v);
}

/** 첫 시트의 머리글과 데이터 행을 문자열로 읽는다 */
export async function readSheet(data: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const width = ws.getRow(1).cellCount;
  const read = (r: number) => Array.from({ length: width }, (_, i) => cellText(ws.getRow(r).getCell(i + 1).value).trim());
  const headers = read(1);
  const rows: string[][] = [];
  for (let r = 2; r <= ws.rowCount && rows.length <= MAX_ROWS; r++) rows.push(read(r));
  return { headers, rows };
}
