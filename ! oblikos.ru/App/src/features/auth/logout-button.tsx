"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  return (
    <div className="logout-control">
      <Button
        variant="quiet"
        className="logout-button"
        aria-label={pending ? "Выход…" : "Выйти"}
        title={pending ? "Выход…" : "Выйти"}
        aria-busy={pending}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            const response = await signOut({
              callbackUrl: "/login",
              redirect: false,
            });
            if (!response?.url) throw new Error("LogoutFailed");
            router.replace("/login");
            router.refresh();
          } catch {
            setFailed(true);
            setPending(false);
          }
        }}
      >
        <Icon name="logout" size={18} />
      </Button>
      {failed && (
        <p role="alert" className="form-hint">
          Не удалось выйти. Повторите попытку.
        </p>
      )}
    </div>
  );
}
