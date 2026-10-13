import type { NextConfig } from "next";
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { validateProductionEnvironment, mediaStorageDirectory, probeMediaStorage } from "./src/lib/validation/production.ts";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  distDir: process.env.NEXT_E2E === "true" ? ".next-e2e" : ".next",
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  logging: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default async function configure(phase: string) {
  // next start initializes instrumentation lazily on the first request. Validate
  // here too so missing critical config fails before the listening server starts.
  if (phase === PHASE_PRODUCTION_SERVER) {
    validateProductionEnvironment();
    await probeMediaStorage(mediaStorageDirectory());
  }
  return nextConfig;
}
