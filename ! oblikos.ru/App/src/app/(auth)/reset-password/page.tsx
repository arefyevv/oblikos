import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
export const metadata: Metadata = {
  title: "Новый пароль",
  referrer: "no-referrer",
};
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthForm
      mode="reset"
      token={token && /^[a-f0-9]{64}$/.test(token) ? token : ""}
    />
  );
}
