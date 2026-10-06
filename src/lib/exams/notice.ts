// 안내문(메일·문자) 템플릿 치환과 문자 길이 계산 (순수 함수). 실제 발송은 하지 않는다.

export type Channel = "email" | "sms";

export const VARIABLES = [
  { token: "$이름$", desc: "응시자 이름" },
  { token: "$시험명$", desc: "시험 이름" },
  { token: "$응시 시작$", desc: "응시 시작 일시" },
  { token: "$응시 기한$", desc: "응시 마감 일시" },
  { token: "$제한 시간$", desc: "제한 시간(분)" },
  { token: "$응시 URL$", desc: "응시자별 개인 응시 링크" },
] as const;

export type NoticeVars = Record<(typeof VARIABLES)[number]["token"], string>;

export const RECOMMENDED: Record<Channel, { subject: string; body: string }> = {
  email: {
    subject: "[$시험명$] 응시 안내",
    body: [
      "$이름$ 님, 안녕하세요.",
      "",
      "신입사원 AI 역량 시험 응시 안내드립니다.",
      "",
      "■ 시험명: $시험명$",
      "■ 응시 기간: $응시 시작$ ~ $응시 기한$",
      "■ 제한 시간: $제한 시간$분 (시작하면 타이머가 멈추지 않습니다)",
      "■ 응시 링크: $응시 URL$",
      "",
      "응시 링크는 본인 전용입니다. 다른 사람과 공유하지 마세요.",
      "조용한 곳에서 PC로 응시하시기를 권장합니다.",
      "",
      "감사합니다.",
    ].join("\n"),
  },
  sms: {
    subject: "",
    body: "[$시험명$] $이름$ 님, $응시 기한$까지 응시해 주세요. 제한 시간 $제한 시간$분. 본인 전용 링크: $응시 URL$",
  },
};

/** 템플릿의 $변수$ 를 값으로 바꾼다. 모르는 변수는 그대로 두고 unknown 으로 알려 준다 */
export function renderTemplate(template: string, vars: Partial<NoticeVars>): { text: string; unknown: string[] } {
  const unknown = new Set<string>();
  const text = template.replace(/\$([^$\n]{1,20})\$/g, (whole) => {
    if (whole in vars) return vars[whole as keyof NoticeVars] ?? whole;
    unknown.add(whole);
    return whole;
  });
  return { text, unknown: [...unknown] };
}

/** 이동통신 문자 길이 기준 바이트 수: 한글 등 비ASCII 2바이트, ASCII 1바이트 (줄바꿈 포함) */
export function smsBytes(text: string): number {
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) <= 0x7f ? 1 : 2;
  return bytes;
}

export const SMS_LIMIT = 90;
export const LMS_LIMIT = 2000;

export function smsKind(bytes: number): "SMS" | "LMS" | "초과" {
  return bytes <= SMS_LIMIT ? "SMS" : bytes <= LMS_LIMIT ? "LMS" : "초과";
}

const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Seoul" });

export function noticeVars(input: { name: string; title: string; starts_at: string; ends_at: string; time_limit_min: number; url: string }): NoticeVars {
  return {
    "$이름$": input.name,
    "$시험명$": input.title,
    "$응시 시작$": fmt.format(new Date(input.starts_at)),
    "$응시 기한$": fmt.format(new Date(input.ends_at)),
    "$제한 시간$": String(input.time_limit_min),
    "$응시 URL$": input.url,
  };
}

/**
 * CSV 한 칸 (따옴표·쉼표·줄바꿈 처리).
 * =, +, -, @ 등으로 시작하면 엑셀이 수식으로 실행할 수 있어 앞에 ' 를 붙여 글자로 연다 (CSV 수식 주입 방지).
 */
export function csvCell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
