// 관리자 인증 (서버 전용). 페이지·Server Action 마다 requireAdmin() 으로 확인한다.
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { MEMORY_ADMIN_ID } from "../attempt/memory-store";
import { getStore, storeMode } from "../attempt/store";
import { verifyAccessToken } from "./jwt";
import { ACCESS_COOKIE, MEMORY_TOKEN_PREFIX, REFRESH_COOKIE, passwordGrant, revoke, sessionCookies } from "./session";

/** 메모리 저장소(개발) 모드에서만 쓰는 데모 관리자 계정 */
export const MEMORY_ADMIN = { email: "admin@demo.local", password: "demo1234" };

export interface Admin {
  id: string;
  email: string | null;
  name: string;
}

async function userFromToken(token: string): Promise<{ id: string; email: string | null } | null> {
  if (token.startsWith(MEMORY_TOKEN_PREFIX)) {
    return storeMode() === "memory" && token === MEMORY_TOKEN_PREFIX + MEMORY_ADMIN_ID ? { id: MEMORY_ADMIN_ID, email: MEMORY_ADMIN.email } : null;
  }
  return verifyAccessToken(token);
}

/** 현재 요청의 관리자. 로그인하지 않았거나 admins 에 없으면 null */
export const getAdmin = cache(async (): Promise<Admin | null> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const user = await userFromToken(token);
  if (!user) return null;
  const admin = await getStore().isAdmin(user.id);
  return admin ? { id: user.id, email: user.email, name: admin.name } : null;
});

export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export type SignInResult = { ok: true } | { ok: false; error: string };

/** Server Action 에서만 호출한다 (쿠키를 쓴다) */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const fail = { ok: false as const, error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  const jar = await cookies();

  if (storeMode() === "memory") {
    if (email !== MEMORY_ADMIN.email || password !== MEMORY_ADMIN.password) return fail;
    for (const c of sessionCookies({ access_token: MEMORY_TOKEN_PREFIX + MEMORY_ADMIN_ID, refresh_token: "memory", expires_in: 12 * 3600 })) jar.set(c);
    return { ok: true };
  }

  const tokens = await passwordGrant(email, password);
  if (!tokens) return fail;
  const user = await verifyAccessToken(tokens.access_token);
  if (!user || !(await getStore().isAdmin(user.id))) {
    await revoke(tokens.access_token);
    return { ok: false, error: "관리자로 등록되지 않은 계정입니다." };
  }
  for (const c of sessionCookies(tokens)) jar.set(c);
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (token && !token.startsWith(MEMORY_TOKEN_PREFIX)) await revoke(token);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
