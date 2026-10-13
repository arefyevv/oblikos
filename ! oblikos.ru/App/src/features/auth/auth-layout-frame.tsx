"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { AuthVisual } from "./auth-visual";

export function AuthLayoutFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname !== "/login" && pathname !== "/register") {
    return (
      <main className="auth-shell">
        <Brand href="https://oblikos.ru/" label="главная страница сайта" />
        {children}
      </main>
    );
  }

  return (
    <main className="auth-split">
      <div className="auth-split__form-side">
        <div className="auth-split__content">
          <Brand href="https://oblikos.ru/" label="главная страница сайта" />
          {children}
        </div>
      </div>
      <AuthVisual />
    </main>
  );
}
