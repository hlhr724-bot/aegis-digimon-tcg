import type { RankedTier } from "@aegis/shared/ranked/RankedTier";
import { useTranslation } from "@/i18n/useTranslation";

import { Avatar, type PlayerIdentity } from "@/design/primitives";

type Props = { tier: RankedTier; player?: PlayerIdentity };

export function RankedCosmeticPreview({ tier, player }: Props) {
  const { t } = useTranslation();
  return (
    <div className="ranked-cosmetic-preview" data-tier={tier} role="img" aria-label={t(`ranked.tier.${tier}`)}>
      <div className="ranked-cosmetic-preview__portrait" data-tier={tier}>
        <Avatar
          name={player?.name ?? ""}
          color={player?.color}
          avatarId={player?.avatarId}
          avatarUrl={player?.avatarUrl}
          size={84}
        />
      </div>
    </div>
  );
}
