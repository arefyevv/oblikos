import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { currentWorkspace } from "@/features/auth/access";
import { CharacterForm } from "@/features/characters/character-form";
export const metadata: Metadata = { title: "Создание персонажа" };
export default async function NewCharacterPage() {
  await currentWorkspace();
  return <><PageHeader title="Создание персонажа" description="От первых черт к целостному характеру — шаг за шагом." action={<ButtonLink href="/characters" variant="secondary">К персонажам</ButtonLink>} /><CharacterForm /></>;
}
