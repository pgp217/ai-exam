import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyAccessToken } from "../jwt";

const URL_ = "https://example.supabase.co";
const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

let keys: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };

async function sign(claims: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey } = {}) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid: opts.kid ?? "k1", typ: "JWT" })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, opts.key ?? keys.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

const good = () => ({
  sub: "user-1", email: "a@b.c", role: "authenticated", aud: "authenticated",
  iss: `${URL_}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600,
});

beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" };
  vi.stubEnv("SUPABASE_URL", URL_);
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/v1/.well-known/jwks.json")) return new Response(JSON.stringify({ keys: [jwk] }));
    return new Response("{}", { status: 401 });
  }));
});

afterEach(() => vi.clearAllMocks());

describe("verifyAccessToken (ES256 / JWKS)", () => {
  it("accepts a valid token", async () => {
    expect(await verifyAccessToken(await sign(good()))).toEqual({ id: "user-1", email: "a@b.c" });
  });

  it("rejects expired, wrong-issuer, wrong-audience, and anon-role tokens", async () => {
    expect(await verifyAccessToken(await sign({ ...good(), exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
    expect(await verifyAccessToken(await sign({ ...good(), iss: "https://evil.example/auth/v1" }))).toBeNull();
    expect(await verifyAccessToken(await sign({ ...good(), aud: "other" }))).toBeNull();
    expect(await verifyAccessToken(await sign({ ...good(), role: "anon" }))).toBeNull();
  });

  it("rejects a tampered payload and a token signed by another key", async () => {
    const t = await sign(good());
    const [h, , s] = t.split(".");
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ ...good(), sub: "someone-else" })));
    expect(await verifyAccessToken(`${h}.${forged}.${s}`)).toBeNull();

    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    expect(await verifyAccessToken(await sign(good(), { key: other.privateKey }))).toBeNull();
  });

  it("rejects an unknown key id and malformed tokens", async () => {
    expect(await verifyAccessToken(await sign(good(), { kid: "nope" }))).toBeNull();
    expect(await verifyAccessToken("not-a-jwt")).toBeNull();
    expect(await verifyAccessToken("a.b.c")).toBeNull();
  });
});
