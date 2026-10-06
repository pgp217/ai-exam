// 시험 관리 폼에서 함께 쓰는 입력 칸 (서버·클라이언트 공용)

export function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-zinc-500">{hint}</p>}
      {error && <p id={`${name}-error`} className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const inputClass = "w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950";

export function FormMessage({ ok, message }: { ok: boolean; message: string | null }) {
  if (!message) return null;
  return <p className={`text-sm ${ok ? "text-emerald-700" : "text-red-600"}`} role={ok ? "status" : "alert"}>{message}</p>;
}
