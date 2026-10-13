import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
export const metadata: Metadata = {
  title: "Подтверждение email",
  referrer: "no-referrer",
};
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthForm
      mode="verify"
      token={token && /^[a-f0-9]{64}$/.test(token) ? token : ""}
    />
  );
}
