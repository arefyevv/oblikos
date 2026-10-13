import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSession } from "@/features/auth/access";
import { availableProviders } from "@/features/auth/config";
import { AuthForm } from "@/features/auth/auth-form";
import { emailAvailable } from "@/features/auth/email";

export const metadata: Metadata = { title: "Вход" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if ((await currentSession()) && !error) redirect("/dashboard");
  return (
    <AuthForm mode="login" providers={availableProviders()} error={error} emailEnabled={emailAvailable()} />
  );
}
