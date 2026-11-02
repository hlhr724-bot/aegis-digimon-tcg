import type { DeckFormat } from "@aegis/shared/deckFormat";
import type { RankedSeason } from "@aegis/shared/ranked/RankedContracts";
import { useState } from "react";
import { CommunityCard } from "@/community/CommunityCard";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { CommunityMatchups } from "@/screens/community/CommunityMatchups";
import { CommunityMetaTable } from "@/screens/community/CommunityMetaTable";
import { deckFormatLabel } from "@/screens/deckFormatLabel";

const DEFAULT_FORMAT: DeckFormat = "standard";

type CommunityMetaParams = {
  onOpenRanked: () => void;
};

export function CommunityMeta({ onOpenRanked }: CommunityMetaParams) {
  const { t } = useTranslation();
  const seasons = useRankedRequest<RankedSeason[]>("/ranked/seasons");
  const season = seasons.data?.[0];
  const formats = season?.formats.length ? season.formats : [DEFAULT_FORMAT];
  const [selectedFormat, setSelectedFormat] = useState<DeckFormat>(DEFAULT_FORMAT);
  const format = formats.includes(selectedFormat) ? selectedFormat : formats[0]!;
  const formatSwitch =
    formats.length > 1 ? (
      <div className="community-switch" role="group" aria-label={t("ranked.season.format")}>
        {formats.map((entry) => (
          <button key={entry} type="button" aria-pressed={entry === format} onClick={() => setSelectedFormat(entry)}>
            {deckFormatLabel(entry, t)}
          </button>
        ))}
      </div>
    ) : undefined;
  return (
    <div className="community-split">
      <div className="community-stack">
        {season ? (
          <CommunityMetaTable season={season} format={format} tools={formatSwitch} />
        ) : (
          <CommunitySeasonStatus
            loading={!seasons.data && !seasons.error}
            failed={seasons.error}
            onRetry={seasons.refresh}
          />
        )}
      </div>
      <aside className="community-stack community-aside">
        <CommunityMatchups format={format} />
        <Button variant="secondary" icon={Icons.Trophy} onClick={onOpenRanked}>
          {t("community.meta.openRanked")}
        </Button>
      </aside>
    </div>
  );
}

type CommunitySeasonStatusParams = {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
};

function CommunitySeasonStatus({ loading, failed, onRetry }: CommunitySeasonStatusParams) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <CommunityCard title={t("community.meta.title")}>
        <p role="status">{t("common.loading")}</p>
      </CommunityCard>
    );
  }
  if (failed) {
    return (
      <CommunityCard title={t("community.meta.title")}>
        <div className="community-empty" role="alert">
          <p>{t("ranked.season.error")}</p>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {t("ranked.season.retry")}
          </Button>
        </div>
      </CommunityCard>
    );
  }
  return (
    <CommunityCard title={t("community.meta.title")}>
      <p className="community-muted">{t("ranked.season.empty")}</p>
    </CommunityCard>
  );
}
