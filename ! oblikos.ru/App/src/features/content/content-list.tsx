import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { contentLabels } from "./validation";
import { ContentDelete } from "./content-delete";
import type { ContentRecord } from "./operations";

export function ContentList({ entries, total, characterId, archived = false }: { entries: ContentRecord[]; total: number; characterId?: string; archived?: boolean }) {
  const href = `/content/new${characterId ? `?characterId=${characterId}` : ""}`;
  return <section className="content-view" aria-labelledby="content-heading">
    <div className="memory-heading"><div><h2 id="content-heading">Контент <span className="memory-count">{total}</span></h2><p>Тексты с учётом личности и памяти персонажа.</p></div>{total > 0 && !archived && <ButtonLink href={href}>Создать контент</ButtonLink>}</div>
    {archived && <p className="form-hint">Чтобы создавать новые тексты, восстановите персонажа из архива. Сохранённые тексты доступны для редактирования.</p>}
    {entries.length ? <ul className="content-list" aria-label="Сохранённый контент">{entries.map((entry) => <li className="content-entry" key={entry.id}>
      <div className="content-entry-copy"><div className="memory-meta"><span>{contentLabels[entry.type]}</span><Link href={`/characters/${entry.characterId}/content`}>{entry.character.name}</Link><span>Черновик</span></div>
        <p className="content-preview">{entry.body.slice(0, 300)}{entry.body.length > 300 ? "…" : ""}</p>
        <time className="memory-date" dateTime={entry.updatedAt.toISOString()}>Обновлено {entry.updatedAt.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })}</time>
      </div><div className="content-row-actions"><ButtonLink href={`/content/${entry.id}`} variant="secondary">Открыть</ButtonLink><ContentDelete id={entry.id} /></div>
    </li>)}</ul> : <EmptyState icon="content" title="Контента пока нет" description="Создайте первый текст от имени персонажа с учётом его личности и памяти.">{!archived && <ButtonLink href={href}>Создать контент</ButtonLink>}</EmptyState>}
    {total > entries.length && <p className="form-hint">Показаны первые {entries.length} из {total} текстов. Откройте вкладку персонажа, чтобы сузить список.</p>}
  </section>;
}
