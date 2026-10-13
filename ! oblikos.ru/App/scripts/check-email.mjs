import nextEnv from "@next/env";
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const { EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
const port = Number(SMTP_PORT);
if (EMAIL_PROVIDER !== "smtp" || !SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    !["true", "false"].includes(SMTP_SECURE) || (port === 465 && SMTP_SECURE !== "true")) {
  console.error("SMTP: заполните EMAIL_PROVIDER=smtp и все SMTP-настройки.");
  process.exitCode = 1;
} else {
  let transport;
  try {
    const { address } = await lookup(SMTP_HOST);
    transport = nodemailer.createTransport({
      host: address, tls: { servername: SMTP_HOST }, port, secure: SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      requireTLS: true, dnsTimeout: 15_000, connectionTimeout: 15_000, greetingTimeout: 15_000,
      socketTimeout: 30_000, logger: false, debug: false,
    });
    await transport.verify();
    console.log("SMTP: соединение и авторизация успешны. Письмо не отправлялось.");
  } catch (error) {
    const reasons = {
      EAUTH: "сервер отклонил логин или пароль",
      ETIMEDOUT: "время ожидания соединения истекло",
      ECONNECTION: "соединение недоступно",
      EDNS: "не удалось определить адрес SMTP-сервера",
      ESOCKET: "ошибка соединения или TLS",
    };
    console.error(`SMTP: ${reasons[error?.code] ?? "проверка не прошла"}.`);
    process.exitCode = 1;
  } finally {
    transport?.close();
  }
}
