import type { ReactNode } from "react";

export function Badge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "neutral" | "accent";
}) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
