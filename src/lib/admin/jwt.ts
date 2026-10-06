// Supabase Auth 액세스 토큰 검증 (서버 전용).
// 비대칭 서명 키(ES256/RS256)를 쓰는 프로젝트는 공개 키(JWKS)로 서명을 직접 확인한다 — 요청마다 Auth 서버를 부르지 않는다.
// 레거시 공유 비밀(HS256) 프로젝트는 공개 키가 없으므로 Auth 서버의 /user 로 확인한다.
import "server-only";

import { authConfig, fetchUser } from "./session";

interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
}

const JWKS_TTL_MS = 10 * 60_000;
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function loadJwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const cfg = authConfig();
  if (!cfg) return [];
  const res = await fetch(`${cfg.url}/auth/v1/.well-known/jwks.json`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const keys = res.ok ? (((await res.json()) as { keys?: Jwk[] }).keys ?? []) : [];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const ALGS: Record<string, { import: EcKeyImportParams | RsaHashedImportParams; verify: EcdsaParams | AlgorithmIdentifier }> = {
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
};

export interface VerifiedUser {
  id: string;
  email: string | null;
}

/** 토큰이 유효하면 사용자, 아니면 null */
export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let claims: { sub?: string; email?: string; exp?: number; aud?: string | string[]; iss?: string; role?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }

  const alg = header.alg ? ALGS[header.alg] : undefined;
  if (!alg) return fetchUser(token); // HS256(레거시): Auth 서버에 확인

  let keys = await loadJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await loadJwks(true); // 키 교체 직후일 수 있다
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;

  const key = await crypto.subtle.importKey("jwk", jwk, alg.import, false, ["verify"]);
  const ok = await crypto.subtle.verify(alg.verify, key, b64urlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;

  const cfg = authConfig();
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!claims.sub || !claims.exp || claims.exp * 1000 <= Date.now()) return null;
  if (!aud.includes("authenticated") || claims.role !== "authenticated") return null;
  if (cfg && claims.iss !== `${cfg.url}/auth/v1`) return null;
  return { id: claims.sub, email: claims.email ?? null };
}
