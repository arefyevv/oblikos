"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, type SidebarUser } from "@/components/layout/sidebar";
import { Icon } from "@/components/ui/icon";
import { mainNavigation } from "@/config/navigation";
import { BrandLogo } from "@/components/layout/brand";

export function AppShell({ children, user }: { children: ReactNode; user: SidebarUser }) {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const section =
    mainNavigation.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Настройки";

  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  function closeDrawer() {
    drawer.current?.close();
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        К содержимому
      </a>
      <aside className="desktop-sidebar">
        <Sidebar user={user} />
      </aside>
      <dialog
        ref={drawer}
        className="mobile-drawer"
        aria-label="Навигация"
        onClose={() => menuButton.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
      >
        <button
          type="button"
          className="icon-button drawer-close"
          onClick={closeDrawer}
          aria-label="Закрыть меню"
        >
          <Icon name="close" />
        </button>
        <Sidebar user={user} onNavigate={closeDrawer} />
      </dialog>
      <div className="app-main">
        <header className="app-header">
          <div className="header-location">
            <button
              ref={menuButton}
              type="button"
              className="icon-button menu-trigger"
              onClick={() => drawer.current?.showModal()}
              aria-label="Открыть меню"
              aria-haspopup="dialog"
            >
              <Icon name="menu" />
            </button>
            <span className="header-product"><BrandLogo className="brand__logo brand__logo--small" /></span>
            <span className="header-divider">/</span>
            <span>{section}</span>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>Личность. Последовательность. Развитие.</span>
          <BrandLogo className="brand__logo brand__logo--small" />
        </footer>
      </div>
    </div>
  );
}
