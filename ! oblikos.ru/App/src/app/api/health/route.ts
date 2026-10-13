import { getDatabase } from "@/db/client";
import { checkMediaStorage } from "@/features/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const [db, storage] = await Promise.allSettled([getDatabase().$queryRaw`SELECT 1`, checkMediaStorage()]);
  const database = db.status === "fulfilled" ? "ok" : "unavailable";
  const media = storage.status === "fulfilled" ? "ok" : "unavailable";
  return Response.json({ application: "ok", database, storage: media }, {
    status: database === "ok" && media === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
