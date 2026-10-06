"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { slug: "basic", label: "기본 설정" },
  { slug: "site", label: "응시 사이트" },
  { slug: "candidates", label: "대상자" },
  { slug: "notice", label: "안내문" },
];

export default function Stepper({ examId, done }: { examId: string; done: Record<string, boolean> }) {
  const path = usePathname();
  return (
    <nav aria-label="시험 설정 단계">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const current = path.endsWith(`/${s.slug}`);
          return (
            <li key={s.slug}>
              <Link
                href={`/admin/exams/${examId}/${s.slug}`}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${current ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}
              >
                <span className={`flex size-5 items-center justify-center rounded-full text-xs ${current ? "bg-white/20" : done[s.slug] ? "bg-emerald-600 text-white" : "bg-zinc-200 dark:bg-zinc-800"}`}>
                  {done[s.slug] && !current ? "✓" : i + 1}
                </span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
