import { useState } from "react";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Zone, type Seat } from "@aegis/shared/schema/enums";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import { CardMini } from "@/design/cards";
import { useTranslation } from "@/i18n/useTranslation";
import "@/game/manual/manualFeatures.css";

type Props = { state: GameState; seat: Seat; send: (command: ManualCommand) => void };

export function ManualTableTools({ state, seat, send }: Props) {
  const { t } = useTranslation();
  const [tokenId, setTokenId] = useState(tokenDefinitions[0]?.cardId ?? "");
  const [zone, setZone] = useState<Zone.Deck | Zone.Security>(Zone.Deck);
  const [count, setCount] = useState(1);
  const available = zone === Zone.Deck ? state.players[seat]!.deckCount : state.players[seat]!.securityCount;
  const hasReveals = (JSON.parse(state.manual.revealedJson || "[]") as { seat: Seat }[]).some(
    (entry) => entry.seat === seat,
  );
  return (
    <>
      <section className="manual-table__group manual-features" aria-label={t("manual.features.createToken")}>
        <label>
          {t("manual.features.token")}
          <select
            aria-label={t("manual.features.token")}
            value={tokenId}
            onChange={(event) => setTokenId(event.target.value)}
          >
            {tokenDefinitions.map((token) => (
              <option key={token.cardId} value={token.cardId}>
                {token.nameEn}
              </option>
            ))}
          </select>
        </label>
        <div className="manual-features__token-preview">
          <CardMini cardId={tokenId} width={52} />
          <button type="button" onClick={() => send({ action: ManualAction.CREATE_TOKEN.value, cardId: tokenId })}>
            {t("manual.features.createToken")}
          </button>
        </div>
      </section>
      <section className="manual-table__group manual-features" aria-label={t("manual.features.revealCards")}>
        <div className="manual-features__row">
          <label>
            {t("manual.features.revealPile")}
            <select
              aria-label={t("manual.features.revealPile")}
              value={zone}
              onChange={(event) => setZone(event.target.value as Zone.Deck | Zone.Security)}
            >
              <option value={Zone.Deck}>{t("manual.zone.deck")}</option>
              <option value={Zone.Security}>{t("manual.zone.security")}</option>
            </select>
          </label>
          <label>
            {t("manual.features.revealCount")}
            <input
              type="number"
              min={1}
              max={Math.min(available, 55)}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!Number.isInteger(count) || count < 1 || count > available || count > 55}
          onClick={() => send({ action: ManualAction.REVEAL.value, from: { zone, index: 0 }, count })}
        >
          {t("manual.features.revealCards")}
        </button>
        <button type="button" disabled={!hasReveals} onClick={() => send({ action: ManualAction.CLEAR_REVEALS.value })}>
          {t("manual.features.clearReveals")}
        </button>
      </section>
    </>
  );
}
