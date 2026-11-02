import { useState } from "react";
import type { RoadmapItem } from "@aegis/shared/roadmap/roadmapTypes";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { roadmapClient } from "@/roadmap/roadmapClient";

type RoadmapSupportButtonParams = {
  item: RoadmapItem;
  signedIn: boolean;
  onSignIn: () => void;
  onChanged: (item: RoadmapItem) => void;
  onFailed: () => void;
};

export function RoadmapSupportButton({ item, signedIn, onSignIn, onChanged, onFailed }: RoadmapSupportButtonParams) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const toggle = () => {
    if (!signedIn) {
      onSignIn();
      return;
    }
    setSaving(true);
    roadmapClient
      .support({ id: item.id, supported: !item.supported })
      .then(onChanged)
      .catch(onFailed)
      .finally(() => setSaving(false));
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      className="roadmap-vote"
      aria-pressed={item.supported}
      aria-label={t("roadmap.supportItem", { title: item.title, count: item.supportCount })}
      disabled={saving}
      onClick={toggle}
    >
      <Icons.ChevronUp size={14} />
      {item.supportCount}
    </Button>
  );
}
