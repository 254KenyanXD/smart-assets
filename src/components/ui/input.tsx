import type { InputHTMLAttributes } from "react";

/**
 * Text field on the Soft Bento card.
 */
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink3 focus:border-accent ${className}`}
      {...props}
    />
  );
}
