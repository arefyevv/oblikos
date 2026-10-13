import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Генерация клиента и build не требуют подключённой БД.
  // Команды миграции при пустом URL завершатся ошибкой настройки.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
