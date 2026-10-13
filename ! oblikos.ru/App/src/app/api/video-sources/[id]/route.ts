import { videoSources } from "@/features/media/source-service";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { source, bytes } = await videoSources.read(id, new URL(request.url).searchParams.get("characterId") || "");
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": source.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 404 }); }
}
