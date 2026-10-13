import { signedVideoInputResponse } from "@/features/media/signed-video-input";
import { LocalStorageProvider } from "@/features/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  return signedVideoInputResponse((await context.params).token, new LocalStorageProvider());
}
export async function HEAD(_request: Request, context: Context) {
  return signedVideoInputResponse((await context.params).token, new LocalStorageProvider(), true);
}
