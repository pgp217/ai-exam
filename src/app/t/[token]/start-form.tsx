"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartForm({ token }: { token: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${encodeURIComponent(token)}/start`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "시작하지 못했습니다.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          위 안내를 확인했으며, 응답 내용과 응답 시간·붙여넣기 기록이 채점과 응답 신뢰도 판정에 쓰이는 데 동의합니다.
          서술형 답안은 이름·사번 없이 AI 1차 채점에 사용되고, 담당자가 최종 확정합니다.
        </span>
      </label>
      <button
        type="button"
        onClick={start}
        disabled={!agreed || busy}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 font-semibold text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "시작하는 중…" : "응시 시작"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
