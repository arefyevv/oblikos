import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    sessionId: string;
  }
  interface User {
    authVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sid?: string;
  }
}
