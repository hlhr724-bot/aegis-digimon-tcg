import { Button } from "@/design/primitives";
import "@/game/manual/manualRevealedCards.css";
import { useState } from "react";
import { ManualAction } from "@aegis/shared/manual/ManualAction";
import type { ManualCommand, ManualLocation } from "@aegis/shared/manual/ManualCommand";
import { Zone } from "@aegis/shared/schema/enums";
import { useTranslation } from "@/i18n/useTranslation";

type Props = {
  from: ManualLocation;
  disabled: boolean;
  send: (command: ManualCommand) => void;
};

export function ManualRevealedCardActions({ from, disabled, send }: Props) {
  const { t } = useTranslation();
  const [zone, setZone] = useState(Zone.Hand);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const ordered = zone === Zone.Deck || zone === Zone.Security || zone === Zone.EggDeck;
  return (
    <fieldset className="manual-revealed-actions" disabled={disabled}>
      <label className="aegis-field">
        <span className="aegis-field__label">{t("manual.features.revealDestination")}</span>
        <select
          className="aegis-field__control"
          aria-label={t("manual.features.revealDestination")}
          value={zone}
          onChange={(event) => setZone(event.target.value as Zone)}
        >
          {[Zone.Hand, Zone.Trash, Zone.BattleArea, Zone.Delay, Zone.Deck, Zone.Security, Zone.EggDeck].map((entry) => (
            <option key={entry} value={entry}>
              {t(`manual.zone.${entry}`)}
            </option>
          ))}
        </select>
      </label>
      {ordered ? (
        <label className="aegis-field">
          <span className="aegis-field__label">{t("manual.position")}</span>
          <select
            className="aegis-field__control"
            aria-label={t("manual.position")}
            value={position}
            onChange={(event) => setPosition(event.target.value as "top" | "bottom")}
          >
            <option value="top">{t("manual.top")}</option>
            <option value="bottom">{t("manual.bottom")}</option>
          </select>
        </label>
      ) : null}
      <Button
        size="sm"
        full
        aria-label={t("manual.features.moveRevealed")}
        onClick={() => send({ action: ManualAction.MOVE.value, from, to: { zone, position }, wholePile: false })}
      >
        {t("manual.move")}
      </Button>
    </fieldset>
  );
}
