import { currentUsage } from "@/features/billing/usage";

export async function GET() {
  return Response.json(await currentUsage(), { headers: { "Cache-Control": "private, no-store" } });
}
