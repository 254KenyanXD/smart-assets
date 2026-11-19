import type { ReactNode } from "react";

/**
 * The bright card the sign-in and home pages sit on.
 */
export function Card({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <section className={`w-full max-w-[420px] rounded-2xl border border-line bg-surface px-6 py-7 ${className}`}>
      {children}
    </section>
  );
}
