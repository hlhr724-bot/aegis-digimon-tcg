import "@/replays/publicReplays.css";
import { useId, useState } from "react";
import { historicalDeckFormats, isDeckFormat, type DeckFormat } from "@aegis/shared/deckFormat";
import type { PublicReplayPage } from "@aegis/shared/replays/PublicReplay";
import { Icons } from "@/design/icons";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { PublicReplayCard } from "@/replays/PublicReplayCard";
import type { PublicReplayRequest } from "@/replays/fetchPublicReplays";
import { usePublicReplays } from "@/replays/usePublicReplays";
import { deckFormatLabel } from "@/screens/deckFormatLabel";

const RULE_FORMATS: DeckFormat[] = ["standard", "pauper", "unlimited"];

type PublicReplaysScreenParams = {
  onOpen: (replayId: string) => void;
  load?: (request: PublicReplayRequest) => Promise<PublicReplayPage>;
};

export function PublicReplaysScreen({ onOpen, load }: PublicReplaysScreenParams) {
  const { t } = useTranslation();
  const filterId = useId();
  const [format, setFormat] = useState<DeckFormat>();
  const { replays, loading, failed, canShowMore, showMore, retry } = usePublicReplays({ format, load });
  const formats = [...RULE_FORMATS, ...historicalDeckFormats().reverse()];

  function getContent() {
    if (replays.length > 0) {
      return (
        <ul className="public-replays__grid">
          {replays.map((replay) => (
            <PublicReplayCard key={replay.id} replay={replay} onOpen={onOpen} />
          ))}
        </ul>
      );
    }
    if (failed) {
      return (
        <div className="public-replays__state">
          <p role="alert">{t("publicReplays.error")}</p>
          <Button variant="secondary" size="sm" onClick={retry}>
            {t("publicReplays.retry")}
          </Button>
        </div>
      );
    }
    if (loading) {
      return (
        <p className="public-replays__state" aria-busy="true">
          {t("common.loading")}
        </p>
      );
    }
    return (
      <div className="public-replays__state">
        <Icons.Play size={28} aria-hidden="true" />
        <p>
          <strong>{t("publicReplays.empty")}</strong>
        </p>
        <p>{t("publicReplays.emptyHint")}</p>
      </div>
    );
  }

  return (
    <main className="public-replays-screen">
      <header className="public-replays-screen__header">
        <div>
          <h1>{t("publicReplays.title")}</h1>
          <p>{t("publicReplays.description")}</p>
        </div>
        <label className="public-replays-screen__filter" htmlFor={filterId}>
          {t("publicReplays.filterLabel")}
          <select
            id={filterId}
            value={format ?? ""}
            onChange={(event) => setFormat(isDeckFormat(event.target.value) ? event.target.value : undefined)}
          >
            <option value="">{t("publicReplays.allFormats")}</option>
            {formats.map((value) => (
              <option key={value} value={value}>
                {deckFormatLabel(value, t)}
              </option>
            ))}
          </select>
        </label>
      </header>
      {getContent()}
      {replays.length > 0 && failed ? (
        <p className="public-replays__state" role="alert">
          {t("publicReplays.error")}
        </p>
      ) : null}
      {canShowMore ? (
        <Button className="public-replays__more" variant="secondary" onClick={showMore}>
          {t("publicReplays.showMore")}
        </Button>
      ) : null}
    </main>
  );
}
