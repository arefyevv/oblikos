import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUser();
  redirect("/dashboard");
}
