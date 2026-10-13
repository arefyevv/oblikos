import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
export default function CharacterNotFound() {
  return <EmptyState title="Персонаж недоступен" description="Вернитесь к списку персонажей и выберите другой профиль."><ButtonLink href="/characters">К персонажам</ButtonLink></EmptyState>;
}
