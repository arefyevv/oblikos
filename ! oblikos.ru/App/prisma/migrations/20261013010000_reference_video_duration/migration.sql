-- Reference video models support longer clips than the original 12s generator.
-- Preserve image checks and bound each explicitly supported video model.
BEGIN;
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_image_check";
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_image_check" CHECK (
  "width" > 0 AND "height" > 0 AND "fileSize" > 0 AND (
    ("type" = 'IMAGE' AND "fileSize" <= 20971520 AND "duration" IS NULL AND "mimeType" IN ('image/png', 'image/jpeg', 'image/webp')) OR
    ("type" = 'VIDEO' AND "fileSize" <= 104857600 AND "mimeType" = 'video/mp4' AND "duration" > 0 AND "duration" IS NOT NULL AND
      ("duration" <= 13 OR
       ("provider" = 'aitunnel-avatar' AND "model" = 'avatar-iv' AND "duration" <= 61) OR
       ("provider" = 'aitunnel-motion' AND "model" IN ('hailuo-3', 'seedance-2.0-mini') AND "duration" <= 16) OR
       ("provider" = 'fal-motion' AND "model" = 'fal-ai/kling-video/v3/pro/motion-control' AND "duration" <= 31)))
  )
);
COMMIT;
