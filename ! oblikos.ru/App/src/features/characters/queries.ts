import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { characters, CharacterUnavailable } from "./service";

export const getCharacter = cache(async (id: string) => {
  try { return await characters.get(id); }
  catch (error) {
    if (error instanceof CharacterUnavailable) notFound();
    throw error;
  }
});
