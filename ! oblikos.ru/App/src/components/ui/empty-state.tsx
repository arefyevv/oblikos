import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

export function EmptyState({
  title,
  description,
  icon = "characters",
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon name={icon} size={28} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="empty-state__action">{children}</div>}
    </div>
  );
}
