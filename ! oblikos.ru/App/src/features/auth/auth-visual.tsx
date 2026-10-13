"use client";

import { useEffect, useState } from "react";

const poster = "/media/auth/character-portrait.webp";
const emptyImage = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

// Pass an optimized local MP4/WebM when the character video is available.
export function AuthVisual({ videoSrc }: { videoSrc?: string }) {
  const [canPlay, setCanPlay] = useState(false);
  const [failedSource, setFailedSource] = useState<string>();

  useEffect(() => {
    if (!videoSrc) return;
    const query = window.matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => setCanPlay(query.matches && !connection?.saveData);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [videoSrc]);

  return (
    <div className="auth-visual" aria-hidden="true">
      <picture>
        <source media="(min-width: 900px)" srcSet={poster} type="image/webp" />
        {/* A tiny inline fallback prevents downloading the desktop portrait on mobile. */}
        <img src={emptyImage} alt="" width={1120} height={1400} decoding="async" />
      </picture>
      {videoSrc && canPlay && failedSource !== videoSrc && (
        <video
          src={videoSrc}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          onError={() => setFailedSource(videoSrc)}
        />
      )}
    </div>
  );
}
