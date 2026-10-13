"use server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { media } from "./service";
import { MediaUnavailable } from "./operations";

export type VideoReferenceImage = { id: string; createdAt: string; isPrimaryReference: boolean };
type Result = { ok: true; images: VideoReferenceImage[]; total: number; selected: VideoReferenceImage | null } | { ok: false; message: string };
const view = (image: { id: string; createdAt: Date; isPrimaryReference: boolean }): VideoReferenceImage => ({ id: image.id, createdAt: image.createdAt.toISOString(), isPrimaryReference: image.isPrimaryReference });

export async function listVideoReferencesAction(characterId: string, page = 1, selectedId?: string): Promise<Result> {
  try {
    z.uuid().parse(characterId);
    if (selectedId) z.uuid().parse(selectedId);
    const result = await media.list(characterId, page, "IMAGE");
    let selected = null;
    if (selectedId) {
      try {
        const image = await media.get(selectedId);
        if (image.characterId === characterId && image.type === "IMAGE") selected = view(image);
      } catch (error) { if (!(error instanceof MediaUnavailable)) throw error; }
    } else {
      const primary = await media.primary(characterId);
      if (primary) selected = view(primary);
    }
    return { ok: true, images: result.entries.map(view), total: result.total, selected };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, message: "Не удалось загрузить фото персонажа. Попробуйте ещё раз." };
  }
}
