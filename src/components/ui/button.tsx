import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Primary is the filled action. Quiet is the second action on the same card. */
  readonly variant?: "primary" | "quiet";
};

/**
 * Soft Bento action. Owned here so the default shadcn theme does not replace the palette.
 */
export function Button({ variant = "primary", className = "", type = "button", ...props }: Props) {
  const look =
    variant === "primary"
      ? "bg-accent-fill text-on-deep"
      : "border border-line bg-surface text-ink";
  return (
    <button
      type={type}
      className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}
