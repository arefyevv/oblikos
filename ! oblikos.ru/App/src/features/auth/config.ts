import "server-only";
import { productionAuthEnvironment } from "@/lib/validation/production";

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const LINK_COOKIE = "oblikos.link";

export const authEnvironment = productionAuthEnvironment;

export function availableProviders() {
  return {
    yandex: Boolean(
      process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET,
    ),
    vk: Boolean(process.env.VK_CLIENT_ID),
  };
}

export function safeCallback(url: string, baseUrl: string) {
  try {
    const target = new URL(url, baseUrl);
    if (
      target.origin === new URL(baseUrl).origin &&
      !target.username &&
      !target.password
    ) {
      if (
        ["/dashboard", "/settings", "/characters", "/content", "/login"].some(
          (path) =>
            target.pathname === path || target.pathname.startsWith(`${path}/`),
        )
      ) {
        return target.href;
      }
    }
  } catch {
    /* invalid URLs fall back to dashboard */
  }
  return `${baseUrl}/dashboard`;
}
