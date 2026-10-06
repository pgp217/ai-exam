// 저장소 선택 (서버 전용)
import "server-only";

import { createMemoryStore } from "./memory-store";
import { createSupabaseStore } from "./supabase-store";
import type { ExamStore, GradingStore } from "./types";

// EXAM_STORE=memory | supabase. 지정하지 않으면 Supabase 서버 키가 있을 때 supabase, 없으면 memory(개발 전용).
type Store = ExamStore & GradingStore;
const g = globalThis as unknown as { __examStore?: Store };

export function storeMode(): "memory" | "supabase" {
  const explicit = process.env.EXAM_STORE;
  if (explicit === "memory" || explicit === "supabase") return explicit;
  if (supabaseUrl() && supabaseKey()) return "supabase";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase 설정이 없습니다. SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 지정하세요.");
  }
  return "memory";
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

export function getStore(): Store {
  if (g.__examStore) return g.__examStore;
  if (storeMode() === "memory") {
    // 개발 서버의 HMR 에서도 데이터가 유지되도록 전역에 둔다
    return (g.__examStore = createMemoryStore());
  }
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) throw new Error("EXAM_STORE=supabase 인데 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  return (g.__examStore = createSupabaseStore(url, key));
}

