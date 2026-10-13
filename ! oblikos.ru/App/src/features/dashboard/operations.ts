import "server-only";
import { getDatabase } from "@/db/client";
import { contentLabels } from "@/features/content/validation";

type Context = { userId: string; workspaceId: string };
export type DashboardEntry = { id: string; title: string; description: string; href: string; date: Date };
export type DashboardData = { hasCharacters: boolean; activity: DashboardEntry[]; content: DashboardEntry[] };
const limit = 5;
const characterSelect = { id: true, name: true } as const;
const recent = [{ updatedAt: "desc" }, { id: "desc" }] as const;
function latest(entries: DashboardEntry[]) {
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime() || b.id.localeCompare(a.id)).slice(0, limit);
}

export function createDashboardService(resolveContext: () => Promise<Context>) {
  return {
    async get(): Promise<DashboardData> {
      const context = await resolveContext();
      return getDatabase().$transaction(async (tx) => {
        if (!await tx.workspaceMember.findUnique({ where: { workspaceId_userId: context } })) throw new Error("WorkspaceUnavailable");
        const character = { workspaceId: context.workspaceId, deletedAt: null };
        const scoped = { workspaceId: context.workspaceId, character };
        const [characters, texts, assets, generations, memories, appearances, personalities] = await Promise.all([
          tx.character.findMany({ where: character, select: { ...characterSelect, createdAt: true, updatedAt: true, status: true }, orderBy: [...recent], take: limit }),
          tx.content.findMany({ where: scoped, select: { id: true, type: true, body: true, createdAt: true, updatedAt: true, character: { select: characterSelect } }, orderBy: [...recent], take: limit }),
          tx.mediaAsset.findMany({ where: { ...scoped, deletedAt: null }, select: { id: true, type: true, createdAt: true, character: { select: characterSelect } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit }),
          tx.mediaGeneration.findMany({ where: scoped, select: { id: true, type: true, status: true, updatedAt: true, character: { select: characterSelect } }, orderBy: [...recent], take: limit }),
          tx.memoryEntry.findMany({ where: { character }, select: { id: true, updatedAt: true, character: { select: characterSelect } }, orderBy: [...recent], take: limit }),
          tx.appearance.findMany({ where: { character }, select: { id: true, updatedAt: true, character: { select: characterSelect } }, orderBy: [...recent], take: limit }),
          tx.personality.findMany({ where: { character }, select: { id: true, updatedAt: true, character: { select: characterSelect } }, orderBy: [...recent], take: limit }),
        ]);
        // Content recency follows the last edit, matching the activity feed.
        const textEntries = texts.map((entry) => ({ id: `text-${entry.id}`, title: `${contentLabels[entry.type]} · ${entry.character.name}`, description: entry.body.slice(0, 180), href: `/content/${entry.id}`, date: entry.updatedAt }));
        const mediaEntries = assets.map((entry) => ({ id: `media-${entry.id}`, title: `${entry.type === "VIDEO" ? "Видео" : "Изображение"} · ${entry.character.name}`, description: "Готово в медиатеке", href: `/characters/${entry.character.id}/media?type=${entry.type}`, date: entry.createdAt }));
        const statuses = { PENDING: "В очереди", PROCESSING: "Создаётся", READY: "Готово", FAILED: "Ошибка генерации" };
        const activity = latest([
          ...characters.map((entry) => ({ id: `character-${entry.id}`, title: entry.status === "ARCHIVED" ? "Персонаж в архиве" : entry.updatedAt.getTime() === entry.createdAt.getTime() ? "Создан персонаж" : "Обновлён персонаж", description: entry.name, href: `/characters/${entry.id}`, date: entry.updatedAt })),
          ...texts.map((entry) => ({ id: `text-${entry.id}`, title: entry.updatedAt.getTime() === entry.createdAt.getTime() ? "Создан текст" : "Обновлён текст", description: `${entry.character.name} · ${contentLabels[entry.type]}`, href: `/content/${entry.id}`, date: entry.updatedAt })),
          ...generations.map((entry) => ({ id: `generation-${entry.id}`, title: `${entry.type === "VIDEO" ? "Видео" : "Изображение"}: ${statuses[entry.status]}`, description: entry.character.name, href: `/characters/${entry.character.id}/media?type=${entry.type}`, date: entry.updatedAt })),
          ...memories.map((entry) => ({ id: `memory-${entry.id}`, title: "Обновлена память", description: entry.character.name, href: `/characters/${entry.character.id}/memory`, date: entry.updatedAt })),
          ...appearances.map((entry) => ({ id: `appearance-${entry.id}`, title: "Обновлена внешность", description: entry.character.name, href: `/characters/${entry.character.id}`, date: entry.updatedAt })),
          ...personalities.map((entry) => ({ id: `personality-${entry.id}`, title: "Обновлена личность", description: entry.character.name, href: `/characters/${entry.character.id}`, date: entry.updatedAt })),
        ]);
        return { hasCharacters: characters.length > 0, activity, content: latest([...textEntries, ...mediaEntries]) };
      });
    },
  };
}
