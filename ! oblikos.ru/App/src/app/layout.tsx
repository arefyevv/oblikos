import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(appConfig.url),
  applicationName: appConfig.name,
  title: { default: appConfig.name, template: `%s · ${appConfig.name}` },
  description: appConfig.description,
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
