/* What the viewer has picked up on the board: a hand card, the card they are inspecting,
   an attacker, and an armed link declaration.

   Two things clear a selection on their own. Escape does, while there is something to
   clear — a pinned preview counts as its own surface, so it takes the key first. And an
   attacker the server has taken the attack away from is dropped, because the board would
   otherwise keep a highlight on a card that can no longer declare. */

import { GameMode } from "@aegis/shared/manual/GameMode";
import { useCallback, useEffect, useState } from "react";
import type { GameState, Seat } from "@aegis/shared";
import { canAttackWith, canVortexAttackWith } from "../../boardModel";
import type { LinkDeclaration } from "../types";

export function useBoardSelection({ state, viewerSeat }: { state: GameState | undefined; viewerSeat: Seat }) {
  /** The selected hand card, by instance id. */
  const [handSel, setHandSel] = useState<string | null>(null);
  /** The pinned hand-card inspection, by instance id. */
  const [handPreview, setHandPreview] = useState<string | null>(null);
  /** The selected attacker, by permanent id. */
  const [selPerm, setSelPerm] = useState<string | null>(null);
  // A link declaration in progress: the card to link (hand or a battle-area top) and the
  // server-projected Digimon it may be plugged into. The next tap on one of them sends it.
  const [linkSel, setLinkSel] = useState<LinkDeclaration | null>(null);
  /** The selected attack is a ＜Vortex＞ declaration. */
  const [vortexMode, setVortexMode] = useState(false);

  const clearDeclarations = useCallback(() => {
    setHandSel(null);
    setSelPerm(null);
    setVortexMode(false);
    setLinkSel(null);
  }, []);

  const clearSel = useCallback(() => {
    setHandPreview(null);
    clearDeclarations();
  }, [clearDeclarations]);

  useEffect(() => {
    if ((!handSel || handPreview) && !selPerm) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape") clearSel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handSel, handPreview, selPerm]);

  const selectedAttacker = state?.players[viewerSeat]?.battleArea.find(
    (permanent) => permanent.permanentId === selPerm,
  );
  const selectedAttackAvailable =
    !!selectedAttacker && (vortexMode ? canVortexAttackWith(selectedAttacker) : canAttackWith(selectedAttacker));
  const manual = state?.gameMode === GameMode.MANUAL.value;
  const manualSelectionExists =
    !!state?.players[viewerSeat] &&
    (state.players[viewerSeat].battleArea.some((permanent) => permanent.permanentId === selPerm) ||
      state.players[viewerSeat].breeding?.permanentId === selPerm);
  useEffect(() => {
    if (manual && manualSelectionExists) return;
    if (selPerm && !selectedAttackAvailable) {
      setSelPerm(null);
      setVortexMode(false);
    }
  }, [selPerm, selectedAttackAvailable, manual, manualSelectionExists]);

  return {
    handSel,
    setHandSel,
    handPreview,
    setHandPreview,
    selPerm,
    setSelPerm,
    linkSel,
    setLinkSel,
    vortexMode,
    setVortexMode,
    clearSel,
    clearDeclarations,
  };
}
