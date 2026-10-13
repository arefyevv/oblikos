import { unstable_rethrow } from "next/navigation";
import { currentSession } from "@/features/auth/access";
import { voice } from "@/features/voice/service";
import { SpeechError, speechContentType } from "@/features/voice/provider";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
  if (!(await currentSession())?.user?.id) return new Response(null, { status: 401, headers });
  try {
    const audio = await voice.audio((await params).id);
    return new Response(new Uint8Array(audio), { headers: { ...headers, "Content-Type": speechContentType(audio) } });
  }
  catch (error) {
    if (error instanceof SpeechError || error instanceof z.ZodError) return new Response(null, { status: 404, headers });
    unstable_rethrow(error); return new Response(null, { status: 503, headers });
  }
}
