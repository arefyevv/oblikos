"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Icon } from "@/components/ui/icon";
import { mainNavigation, futureNavigation } from "@/config/navigation";
import { LogoutButton } from "@/features/auth/logout-button";

export type SidebarUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function AccountAvatar({ image, initial }: { image?: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="sidebar__avatar" aria-hidden="true">
      {image && !failed ? (
        <Image
          src={image}
          alt=""
          width={32}
          height={32}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : initial}
    </span>
  );
}

export function Sidebar({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const displayName = user.name?.trim() || user.email || "Аккаунт";
  const initial = Array.from(displayName)[0]?.toLocaleUpperCase("ru") || "?";

  return (
    <div className="sidebar">
      <div onClick={onNavigate}>
        <Brand />
      </div>
      <nav className="sidebar__navigation" aria-label="Основная навигация">
        <p className="navigation-label">Пространство</p>
        {mainNavigation.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`nav-item ${active ? "nav-item--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="sidebar__future">
          <p className="navigation-label">Работа</p>
          {futureNavigation.map((item) => (
            <div
              className="nav-item nav-item--unavailable"
              key={item.label}
              aria-disabled="true"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <span className="nav-soon">Позже</span>
            </div>
          ))}
        </div>
      </nav>
      <div className="sidebar__bottom">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={`nav-item ${pathname === "/settings" ? "nav-item--active" : ""}`}
          aria-current={pathname === "/settings" ? "page" : undefined}
        >
          <Icon name="settings" />
          <span>Настройки</span>
        </Link>
        <div className="sidebar__account-area">
          <Link
            href="/settings"
            onClick={onNavigate}
            className="sidebar__account"
            aria-label={`Настройки аккаунта: ${displayName}`}
          >
            <AccountAvatar key={user.image} image={user.image} initial={initial} />
            <span className="sidebar__account-copy">
              <span className="sidebar__account-name" title={displayName}>{displayName}</span>
              {user.email && <span className="sidebar__account-email" title={user.email}>{user.email}</span>}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
