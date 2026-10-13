import "server-only";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { z } from "zod";

const oauthTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

async function providerJson(url: string, options: RequestInit) {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("ProviderUnavailable");
  return response.json() as Promise<unknown>;
}

const yandexProfileSchema = z.object({
  id: z.string().min(1).max(255),
  client_id: z.string(),
  real_name: z.string().optional(),
  display_name: z.string().optional(),
  default_email: z.string().optional(),
  default_avatar_id: z.string().optional(),
  is_avatar_empty: z.boolean().optional(),
});
type YandexProfile = z.infer<typeof yandexProfileSchema>;

export function yandexProvider(): OAuthConfig<YandexProfile> {
  return {
    id: "yandex",
    name: "Яндекс ID",
    type: "oauth",
    clientId: process.env.YANDEX_CLIENT_ID,
    clientSecret: process.env.YANDEX_CLIENT_SECRET,
    checks: ["state", "pkce"],
    allowDangerousEmailAccountLinking: false,
    authorization: {
      url: "https://oauth.yandex.ru/authorize",
      params: {
        scope: "login:info login:email login:avatar",
        force_confirm: "yes",
      },
    },
    token: "https://oauth.yandex.ru/token",
    userinfo: {
      url: "https://login.yandex.ru/info",
      async request({ tokens, provider }) {
        const profile = yandexProfileSchema.parse(
          await providerJson("https://login.yandex.ru/info?format=json", {
            headers: { Authorization: `OAuth ${tokens.access_token}` },
          }),
        );
        if (profile.client_id !== provider.clientId)
          throw new Error("OAuthFailed");
        return { ...profile, sub: profile.id };
      },
    },
    profile(data) {
      return {
        id: data.id,
        name: data.real_name || data.display_name || "Пользователь",
        email: data.default_email ?? null,
        image:
          data.default_avatar_id && !data.is_avatar_empty
            ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(data.default_avatar_id)}/islands-200`
            : null,
      };
    },
    httpOptions: { timeout: 10_000 },
  };
}

const vkUserSchema = z.object({
  user: z.object({
    user_id: z.union([z.string().min(1), z.number()]),
    email: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    avatar: z.string().optional(),
  }),
});
type VkProfile = z.infer<typeof vkUserSchema>;

// Current VK ID protocol (official VKCOM SDK), not the legacy VK provider.
export function vkProvider(
  callbackDeviceId?: string | null,
): OAuthConfig<VkProfile> {
  return {
    id: "vk",
    name: "VK ID",
    type: "oauth",
    clientId: process.env.VK_CLIENT_ID,
    checks: ["state", "pkce"],
    allowDangerousEmailAccountLinking: false,
    client: { token_endpoint_auth_method: "none" },
    authorization: {
      url: "https://id.vk.ru/authorize",
      params: { scope: "email", prompt: "select_account" },
    },
    token: {
      url: "https://id.vk.ru/oauth2/auth",
      async request({ provider, params, checks }) {
        // Auth.js custom token handler must explicitly validate state.
        if (
          !checks.state ||
          params.state !== checks.state ||
          !checks.code_verifier ||
          !params.code ||
          !callbackDeviceId ||
          callbackDeviceId.length > 1024
        )
          throw new Error("OAuthFailed");
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: provider.clientId!,
          redirect_uri: provider.callbackUrl,
          code: params.code,
          code_verifier: checks.code_verifier,
          state: checks.state,
          device_id: callbackDeviceId,
        });
        const raw = await providerJson("https://id.vk.ru/oauth2/auth", {
          method: "POST",
          body,
        });
        const result = oauthTokenSchema
          .extend({ state: z.string() })
          .parse(raw);
        if (result.state !== checks.state) throw new Error("OAuthFailed");
        // id_token / refresh_token are deliberately not persisted or trusted.
        return {
          tokens: {
            access_token: result.access_token,
            token_type: result.token_type || "bearer",
            expires_in: result.expires_in,
          },
        };
      },
    },
    userinfo: {
      url: "https://id.vk.ru/oauth2/user_info",
      async request({ tokens, provider }) {
        const profile = vkUserSchema.parse(
          await providerJson("https://id.vk.ru/oauth2/user_info", {
            method: "POST",
            body: new URLSearchParams({
              client_id: provider.clientId!,
              access_token: tokens.access_token!,
            }),
          }),
        );
        return { ...profile, sub: String(profile.user.user_id) };
      },
    },
    profile(data) {
      return {
        id: String(data.user.user_id),
        name:
          [data.user.first_name, data.user.last_name]
            .filter(Boolean)
            .join(" ") || "Пользователь",
        email: data.user.email ?? null,
        image: data.user.avatar ?? null,
      };
    },
  };
}
