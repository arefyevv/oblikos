import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/auth-form";
import { emailAvailable } from "@/features/auth/email";
export const metadata: Metadata = { title: "Восстановление пароля" };
export default function ForgotPasswordPage() {
  return <AuthForm mode="forgot" emailEnabled={emailAvailable()} />;
}
