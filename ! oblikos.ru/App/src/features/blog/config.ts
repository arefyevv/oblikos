export const blogConfig = {
  origin: "https://oblikos.ru",
  title: "Блог Oblik OS",
  description: "Практические материалы о создании AI-персонажей, виртуальных инфлюенсеров и контента с постоянной цифровой личностью.",
  registrationUrl: "https://app.oblikos.ru/register",
  defaultCover: "/blog/media/sofia.webp",
} as const;

export function blogUrl(path = "/blog") {
  return new URL(path, blogConfig.origin).href;
}

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(date));
}
