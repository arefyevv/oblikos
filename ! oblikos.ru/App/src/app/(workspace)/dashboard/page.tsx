import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/dashboard";
import { dashboard } from "@/features/dashboard/service";

export const metadata: Metadata = { title: "Обзор" };
export default async function DashboardPage() {
  return <Dashboard {...await dashboard.get()} />;
}
