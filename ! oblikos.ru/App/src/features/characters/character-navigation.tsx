"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { characterNavigation } from "@/config/navigation";
import { Icon } from "@/components/ui/icon";

export function CharacterSettingsLink({ id }: { id: string }) {
  const pathname = usePathname();
  const href = `/characters/${id}/settings`;
  const active = pathname === href;
  return <Link href={href} className={`icon-button${active ? " character-settings--active" : ""}`} aria-label="Настройки персонажа" title="Настройки персонажа" aria-current={active ? "page" : undefined}><Icon name="cog" /></Link>;
}

export function CharacterNavigation({ id }: { id: string }) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    function revealActiveTab() {
      if (!nav) return;
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const bounds = nav.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      if (tab.left < bounds.left || tab.right > bounds.left + nav.clientWidth) {
        nav.scrollTo({ left: nav.scrollLeft + tab.left - bounds.left - (nav.clientWidth - tab.width) / 2, behavior: "instant" });
      }
    }
    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [pathname]);
  return (
    <nav ref={navigation} className="character-navigation" aria-label="Разделы персонажа">
      {characterNavigation.map((item) => {
        if (item.segment === "history" || item.segment === "settings") return null;
        const href = `/characters/${id}${item.segment ? `/${item.segment}` : ""}`;
        const active = href === pathname;
        return (
          <Link
            href={href}
            scroll={false}
            key={item.segment}
            className={
              active ? "character-tab character-tab--active" : "character-tab"
            }
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
