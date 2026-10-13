import { z } from "zod";

export const databaseUrlSchema = z
  .url()
  .refine(
  (value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["postgresql:", "postgres:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.pathname.length > 1
    );
  },
    "DATABASE_URL должен быть PostgreSQL connection URL",
  );
