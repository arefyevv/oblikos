import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: "Введите корректный email." }));
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "Пароль должен содержать не менее 8 символов.")
  .max(PASSWORD_MAX_LENGTH, "Пароль не должен превышать 128 символов.");
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((data) => data.password === data.confirmation, {
    message: "Пароли не совпадают.",
    path: ["confirmation"],
  });
export const resetSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: passwordSchema,
    confirmation: z.string(),
  })
  .refine((data) => data.password === data.confirmation, {
    message: "Пароли не совпадают.",
    path: ["confirmation"],
  });
export const providerSchema = z.enum(["yandex", "vk"]);
