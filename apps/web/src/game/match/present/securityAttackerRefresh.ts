import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ServerEvent } from "@aegis/shared";
import type { SecurityClashAttacker, SecurityClashScene } from "../../securityClash";
import type { RevealOnStage } from "../types";

/**
 * Keep the attacker on a running check's scene as the card it currently is.
 *
 * The attacker is remembered from the attack that opened the check, and the check can run
 * for as long as the server needs. Effects that fire on "when your opponent's security
 * stack is removed from" digivolve the attacker in the middle of it, so by the time the
 * card is being looked at on centre stage it is a different Digimon than the one that
 * declared. The reveal captured its art once; without this the viewer watches the old card
 * fight, and the new one only appears when the check closes.
 */
export function refreshSecurityAttacker({
  fresh,
  securityAttackerRef,
  revealOnStageRef,
  setSecurityClash,
}: {
  fresh: readonly ServerEvent[];
  securityAttackerRef: MutableRefObject<SecurityClashAttacker | undefined>;
  revealOnStageRef: MutableRefObject<RevealOnStage | null>;
  setSecurityClash: Dispatch<SetStateAction<SecurityClashScene | null>>;
}) {
  const attacker = securityAttackerRef.current;
  if (attacker?.permanentId === undefined) return;
  const digivolved = [...fresh]
    .reverse()
    .find(
      (event): event is Extract<ServerEvent, { kind: "digivolved" }> =>
        event.kind === "digivolved" && event.permanentId === attacker.permanentId,
    );
  if (digivolved === undefined) return;
  const cardId = digivolved.cardId;
  const artId = digivolved.artId ?? digivolved.cardId;
  securityAttackerRef.current = { ...attacker, cardId, artId };
  const reface = <Scene extends SecurityClashScene | null>(current: Scene): Scene =>
    current?.attacker === undefined ? current : { ...current, attacker: { ...current.attacker, cardId, artId } };
  const staged = revealOnStageRef.current;
  if (staged !== null) revealOnStageRef.current = { ...staged, scene: reface(staged.scene) };
  setSecurityClash(reface);
}
