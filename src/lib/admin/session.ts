// 관리자 세션 쿠키와 Supabase Auth(GoTrue) 호출. proxy.ts 에서도 쓰므로 server-only 를 붙이지 않는다.
// 토큰은 httpOnly 쿠키에만 두고 브라우저 JS 에서는 읽지 않는다.

export const ACCESS_COOKIE = "aiexam-at";
export const REFRESH_COOKIE = "aiexam-rt";
const REFRESH_MAX_AGE = 30 * 24 * 3600;
/** 만료까지 이 시간 이내면 미리 갱신한다 */
export const REFRESH_MARGIN_SEC = 60;

/** 메모리 저장소(개발) 모드의 데모 관리자 토큰 접두사 */
export const MEMORY_TOKEN_PREFIX = "memory.";

export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export function sessionCookies(t: TokenSet) {
  return [
    { name: ACCESS_COOKIE, value: t.access_token, ...cookieOptions(t.expires_in) },
    { name: REFRESH_COOKIE, value: t.refresh_token, ...cookieOptions(REFRESH_MAX_AGE) },
  ];
}

/** JWT 의 exp(초). 서명은 확인하지 않으므로 갱신 시점 판단에만 쓴다. 사용자 확인은 Auth 서버에 묻는다. */
export function jwtExp(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function needsRefresh(accessToken: string | undefined, nowSec = Date.now() / 1000): boolean {
  if (!accessToken) return true;
  if (accessToken.startsWith(MEMORY_TOKEN_PREFIX)) return false;
  const exp = jwtExp(accessToken);
  return exp == null || exp - nowSec < REFRESH_MARGIN_SEC;
}

// ── Supabase Auth ──────────────────────────────────────

export function authConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 로그인에는 공개 키(anon/publishable)면 충분하다. 없으면 서버 키를 쓴다.
  const key =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

async function auth<T>(path: string, init: { method?: string; body?: unknown; token?: string }): Promise<{ ok: boolean; status: number; data: T | null }> {
  const cfg = authConfig();
  if (!cfg) return { ok: false, status: 500, data: null };
  const headers: Record<string, string> = { apikey: cfg.key, "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${cfg.url}/auth/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function passwordGrant(email: string, password: string): Promise<TokenSet | null> {
  const r = await auth<TokenSet>("/token?grant_type=password", { method: "POST", body: { email, password } });
  return r.ok ? r.data : null;
}

export async function refreshGrant(refreshToken: string): Promise<TokenSet | null> {
  const r = await auth<TokenSet>("/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } });
  return r.ok ? r.data : null;
}

export async function fetchUser(accessToken: string): Promise<{ id: string; email: string | null } | null> {
  const r = await auth<{ id: string; email?: string }>("/user", { token: accessToken });
  return r.ok && r.data?.id ? { id: r.data.id, email: r.data.email ?? null } : null;
}

export async function revoke(accessToken: string): Promise<void> {
  await auth("/logout", { method: "POST", token: accessToken }).catch(() => undefined);
}
