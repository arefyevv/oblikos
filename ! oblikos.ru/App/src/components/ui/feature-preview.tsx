import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { IconName } from "@/components/ui/icon";

export function FeaturePreview({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  stage: number;
  icon: IconName;
}) {
  return (
    <Card className="feature-preview">
      <Badge>Скоро</Badge>
      <EmptyState title={title} description={description} icon={icon} />
      <p className="preview-note">
        Функция появится на следующем этапе разработки.
      </p>
    </Card>
  );
}
