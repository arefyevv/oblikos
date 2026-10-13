import { AuthLayoutFrame } from "@/features/auth/auth-layout-frame";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthLayoutFrame>{children}</AuthLayoutFrame>
  );
}
