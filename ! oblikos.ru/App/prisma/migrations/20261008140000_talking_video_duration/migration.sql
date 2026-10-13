-- Talking portraits support up to 60 seconds, with container timing tolerance.
-- Keep the original 13-second limit for other video providers.
BEGIN;
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_image_check";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_image_check" CHECK (
  "width" > 0 AND "height" > 0 AND "fileSize" > 0 AND (
    ("type" = 'IMAGE' AND "fileSize" <= 20971520 AND "duration" IS NULL AND "mimeType" IN ('image/png', 'image/jpeg', 'image/webp')) OR
    ("type" = 'VIDEO' AND "fileSize" <= 104857600 AND "mimeType" = 'video/mp4' AND "duration" > 0 AND "duration" IS NOT NULL AND
      ("duration" <= 13 OR ("provider" = 'aitunnel-avatar' AND "model" = 'avatar-iv' AND "duration" <= 61)))
  )
);
COMMIT;
