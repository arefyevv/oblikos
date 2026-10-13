import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSession } from "@/features/auth/access";
import { availableProviders } from "@/features/auth/config";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Регистрация" };
export default async function RegisterPage() {
  if (await currentSession()) redirect("/dashboard");
  return <AuthForm mode="register" providers={availableProviders()} />;
}
