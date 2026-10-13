import type { IconName } from "@/components/ui/icon";

export type NavigationItem = { label: string; href: string; icon: IconName };

export const mainNavigation: NavigationItem[] = [
  { label: "Обзор", href: "/dashboard", icon: "overview" },
  { label: "Персонажи", href: "/characters", icon: "characters" },
  { label: "Контент", href: "/content", icon: "content" },
  { label: "Анимация", href: "/animation", icon: "video" },
  { label: "Медиатека", href: "/media", icon: "media" },
];

export const futureNavigation: { label: string; icon: IconName }[] = [
  { label: "Аналитика", icon: "analytics" },
];

export const characterNavigation = [
  { label: "Обзор", segment: "", icon: "overview", stage: 3 },
  { label: "Идентичность", segment: "identity", icon: "identity", stage: 3 },
  { label: "Внешность", segment: "appearance", icon: "appearance", stage: 3 },
  { label: "Личность", segment: "personality", icon: "personality", stage: 3 },
  { label: "Голос", segment: "voice", icon: "voice", stage: 3 },
  { label: "Память", segment: "memory", icon: "memory", stage: 4 },
  { label: "Контент", segment: "content", icon: "content", stage: 5 },
  { label: "Медиа", segment: "media", icon: "media", stage: 6 },
  { label: "История", segment: "history", icon: "history", stage: 5 },
  { label: "Настройки", segment: "settings", icon: "settings", stage: 3 },
] as const satisfies ReadonlyArray<{
  label: string;
  segment: string;
  icon: IconName;
  stage: number;
}>;
