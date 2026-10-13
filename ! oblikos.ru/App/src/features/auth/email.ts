import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";

export interface EmailProvider {
  send(message: { to: string; subject: string; url: string }): Promise<void>;
}

function smtpConfiguration() {
  if (process.env.EMAIL_PROVIDER !== "smtp") return null;
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const secure = process.env.SMTP_SECURE;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM?.trim();
  if (
    !host || !user || !pass || !from ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    !["true", "false"].includes(secure ?? "") ||
    (port === 465 && secure !== "true") ||
    [host, user, from].some((value) => /[\r\n]/.test(value))
  ) return null;
  return { host, port, secure: secure === "true", auth: { user, pass }, from };
}

export function emailProvider(): EmailProvider {
  const smtp = smtpConfiguration();
  if (smtp) {
    const { from, ...options } = smtp;
    return {
      async send(message) {
        try {
          // Use the OS resolver, including the local system DNS configuration.
          const { address } = await dns.lookup(options.host);
          const transport = nodemailer.createTransport({
            ...options,
            host: address,
            tls: { servername: options.host },
            requireTLS: true,
            connectionTimeout: 15_000,
            dnsTimeout: 15_000,
            greetingTimeout: 15_000,
            socketTimeout: 30_000,
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          });
          const result = await transport.sendMail({
            from,
            to: message.to,
            subject: message.subject,
            text: `${message.subject}\n\nОткройте ссылку, чтобы продолжить:\n${message.url}\n\nЕсли вы не запрашивали это письмо, просто проигнорируйте его.`,
          });
          if (!result.accepted.length || result.rejected.length) {
            throw new Error("Email recipient rejected");
          }
        } catch {
          // Do not expose SMTP credentials, recipients or authentication URLs.
          throw new Error("Email delivery failed");
        }
      },
    };
  }
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.EMAIL_PROVIDER !== "development"
  ) {
    throw new Error("Email delivery is not configured");
  }
  return {
    async send(message) {
      const directory = join(process.cwd(), "artifacts", "dev-mail");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      // Local files only, never a public route, client response or server log.
      await writeFile(
        join(directory, `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify(message, null, 2),
        { mode: 0o600 },
      );
    },
  };
}

export const emailAvailable = () =>
  smtpConfiguration() !== null ||
  (process.env.NODE_ENV === "development" &&
    process.env.EMAIL_PROVIDER === "development");
