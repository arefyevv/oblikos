import Link from "next/link";
import Image from "next/image";
import { appConfig } from "@/config/app";

export function BrandLogo({ className = "brand__logo", src = "/logo.svg" }: { className?: string; src?: string }) {
  return <Image src={src} alt={appConfig.name} width={445} height={99} className={className} unoptimized />;
}

export function Brand({ href = "/dashboard", label = "обзор", logoSrc }: { href?: string; label?: string; logoSrc?: string }) {
  return (
    <Link href={href} className="brand" aria-label={`${appConfig.name} — ${label}`}>
      <BrandLogo src={logoSrc} />
    </Link>
  );
}
