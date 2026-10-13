import { unstable_rethrow } from "next/navigation";
import { currentSession } from "@/features/auth/access";
import { media } from "@/features/media/service";
import { MediaUnavailable } from "@/features/media/operations";
import { ImageError } from "@/features/ai/image-types";
import { parseRange, InvalidRange } from "@/features/media/range";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())?.user?.id) return new Response(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  try {
    const file = await media.open((await params).id);
    const headers: Record<string, string> = { "Content-Type": file.mimeType, "Accept-Ranges": "bytes", "Content-Length": String(file.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin" };
    try {
      const range = parseRange(request.headers.get("range"), file.size);
      if (range) { headers["Content-Range"] = `bytes ${range.start}-${range.end}/${file.size}`; headers["Content-Length"] = String(range.end - range.start + 1); }
      return new Response(file.stream(range?.start, range?.end), { status: range ? 206 : 200, headers });
    } catch (error) {
      await file.close();
      if (error instanceof InvalidRange) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" } });
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaUnavailable || error instanceof ImageError) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    unstable_rethrow(error);
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
