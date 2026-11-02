import { RankedDiscordStatus } from "@aegis/shared/ranked/RankedDiscordStatus";
import { RankedTier } from "@aegis/shared/ranked/RankedTier";
import { useState } from "react";
import type { RankedRewards } from "@aegis/shared/ranked/RankedContracts";
import { request } from "@/account/client";
import { useTranslation } from "@/i18n/useTranslation";
import { Button, type PlayerIdentity } from "@/design/primitives";
import { useRankedRequest } from "@/ranked/useRankedRequest";
import { RankedCosmeticPreview } from "@/ranked/RankedCosmeticPreview";

type Props = { player?: PlayerIdentity; signedIn: boolean; currentTier?: RankedTier; onEquipped?: () => void };

export function RankedRewardsPanel({ player, signedIn, currentTier, onEquipped }: Props) {
  const { t, locale } = useTranslation();
  const { data, error, refresh } = useRankedRequest<RankedRewards>(signedIn ? "/ranked/rewards" : null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  async function handleAction(path: string, body: unknown) {
    setBusy(true);
    setActionError(false);
    try {
      await request(path, { method: "POST", body: JSON.stringify(body) });
      refresh();
      onEquipped?.();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!signedIn) {
    return <p>{t("ranked.season.signIn")}</p>;
  }
  return (
    <section className="ranked-rewards" aria-label={t("ranked.season.rewards")}>
      <div className="ranked-rewards__intro">
        <h3 className="ranked-rewards__title">{t("ranked.season.cosmetics")}</h3>
        <p>{t("ranked.season.eligibility")}</p>
        <ol className="ranked-tier-track" aria-label={t("ranked.season.tiers")}>
          {Object.values(RankedTier).map((tier) => (
            <li key={tier.value} data-tier={tier.value} data-current={tier.value === currentTier || undefined}>
              <RankedCosmeticPreview player={player} tier={tier.value} />
              {tier.value === currentTier ? <span className="ranked-you">{t("ranked.season.you")}</span> : null}
              <span>{tier.minimum.toLocaleString(locale)}+</span>
            </li>
          ))}
        </ol>
      </div>
      {error || actionError ? (
        <p role="alert">
          {t("ranked.season.error")}{" "}
          <Button variant="secondary" onClick={refresh}>
            {t("ranked.season.retry")}
          </Button>
        </p>
      ) : null}
      {!data && !error ? <p role="status">{t("common.loading")}</p> : null}
      {data?.items.length === 0 ? <p className="ranked-empty">{t("ranked.season.noRewards")}</p> : null}
      {data?.items.map((reward) => (
        <article className="ranked-reward" data-tier={reward.tier} key={reward.seasonId}>
          <RankedCosmeticPreview player={player} tier={reward.tier} />
          <div className="ranked-reward__summary">
            <h3>{t(`ranked.tier.${reward.tier}`)}</h3>
            <p>{t("ranked.season.number", { number: reward.seasonId })}</p>
          </div>
          <Button
            disabled={busy}
            variant={reward.equipped ? "secondary" : "primary"}
            onClick={() =>
              void handleAction("/ranked/rewards/equip", { seasonId: reward.equipped ? null : reward.seasonId })
            }
          >
            {t(reward.equipped ? "ranked.season.unequip" : "ranked.season.equip")}
          </Button>
        </article>
      ))}
      {data && data.discordAttempts > 0 ? <p role="status">{t("ranked.season.discordRetry")}</p> : null}
      {data?.discordEnabled ? (
        <div className="ranked-rewards__discord">
          <label className="ranked-discord">
            <input
              type="checkbox"
              disabled={busy}
              checked={data.discordOptIn}
              onChange={(event) => void handleAction("/ranked/discord", { optedIn: event.target.checked })}
            />
            {t("ranked.season.discord")}
          </label>
          {data.discordStatus ? (
            <p role="status">
              {t(
                data.discordStatus === RankedDiscordStatus.SYNCED.value
                  ? "ranked.season.discordSynced"
                  : "ranked.season.discordPending",
              )}
            </p>
          ) : null}
        </div>
      ) : data ? (
        <p className="ranked-muted">{t("ranked.season.discordUnavailable")}</p>
      ) : null}
    </section>
  );
}
