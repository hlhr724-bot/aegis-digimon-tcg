import { useContext, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { GameMode } from "@aegis/shared/manual/GameMode";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import { I18nContext } from "@/i18n/I18nContext";
import { translator } from "@/i18n/translator";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";
import { pushNarrationItem, type NarrationItem } from "@/game/narration";
import { presentableNarration } from "@/game/match/narration/presentableNarration";
import { Side } from "@/game/side";

type Params = {
  state: GameState | undefined;
  viewerSeat: Seat;
  collapseNarration: boolean;
  narrationLimit: number;
  setNarration: Dispatch<SetStateAction<ReadonlyMap<string, NarrationItem>>>;
};

const fallbackTranslator = translator("en");

export function useManualSignalNarration({
  state,
  viewerSeat,
  collapseNarration,
  narrationLimit,
  setNarration,
}: Params) {
  const t = useContext(I18nContext)?.t ?? fallbackTranslator;
  const getCardName = useTranslatedCardName();
  const lastSignal = useRef("");
  const table = state?.manual;
  const signalRevision = table?.signalRevision;
  useEffect(() => {
    if (
      !state ||
      state.gameMode !== GameMode.MANUAL.value ||
      !table ||
      table.signalSeat === -1 ||
      !table.signalCardId
    ) {
      return;
    }
    const id = `manual-signal:${state.matchId}:${table.signalRevision}`;
    if (id === lastSignal.current) {
      return;
    }
    lastSignal.current = id;
    const player = state.players[table.signalSeat]?.displayName ?? "";
    let text = t("manual.signal.activating", { player });
    if (table.signalTargetSeat !== -1) {
      text += ` · ${t("manual.signal.target")}: ${state.players[table.signalTargetSeat]?.displayName ?? ""}`;
    } else if (table.signalTargetPermanentId) {
      const target = Array.from(state.players)
        .flatMap((entry) => [...entry.battleArea, ...(entry.breeding ? [entry.breeding] : [])])
        .find((permanent) => permanent.permanentId === table.signalTargetPermanentId);
      const targetName = target?.topCard.faceUp ? getCardName(target.topCard.cardId) : t("manual.combat.missingCard");
      text += ` · ${t("manual.signal.target")}: ${targetName}`;
    }
    const createdAt = Date.now();
    const side = table.signalSeat === viewerSeat ? Side.Viewer : Side.Opponent;
    const item = presentableNarration(
      {
        id,
        side,
        batchId: id,
        source: table.signalCardId,
        createdAt,
        notice: {
          id,
          side,
          createdAt,
          fromSecurity: false,
          body: { variant: "effect", cardId: table.signalCardId, artId: table.signalArtId, manualSignalText: text },
        },
      },
      { collapseNarration },
    );
    setNarration((items) => pushNarrationItem(items, item, narrationLimit, collapseNarration));
  }, [state, table, signalRevision, viewerSeat, collapseNarration, narrationLimit, setNarration, getCardName, t]);
}
