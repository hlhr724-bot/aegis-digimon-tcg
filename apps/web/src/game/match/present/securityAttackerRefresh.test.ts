import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared";
import { buildSecurityRevealScene, type SecurityClashScene } from "../../securityClash";
import type { RevealOnStage } from "../types";
import { refreshSecurityAttacker } from "./securityAttackerRefresh";

/* "When your opponent's security stack is removed from, 1 of your Digimon may digivolve"
   fires inside the check, so the card fighting on stage stops being the card that
   declared. The scene has to follow it; the reveal captured the art once. */
describe("refreshSecurityAttacker", () => {
  function sceneWithAttacker(): SecurityClashScene {
    return buildSecurityRevealScene({
      key: 1,
      revealedCardId: "BT13-065",
      defenderSeat: 0,
      viewerSeat: 0,
      attacker: { seat: 1, cardId: "BT24-011", artId: "BT24-011", permanentId: "perm-6" },
    });
  }

  const digivolved: ServerEvent = {
    kind: "digivolved",
    seat: 1,
    permanentId: "perm-6",
    cardId: "BT24-018",
    artId: "BT24-018",
    mechanic: "normal",
  };

  it("repaints the attacker that digivolved mid-check", () => {
    const securityAttackerRef = {
      current: { seat: 1 as const, cardId: "BT24-011", artId: "BT24-011", permanentId: "perm-6" },
    };
    let scene: SecurityClashScene | null = sceneWithAttacker();
    const revealOnStageRef: { current: RevealOnStage | null } = { current: { key: 1, scene: sceneWithAttacker() } };
    refreshSecurityAttacker({
      fresh: [digivolved],
      securityAttackerRef,
      revealOnStageRef,
      setSecurityClash: (update) => {
        scene = typeof update === "function" ? update(scene) : update;
      },
    });
    expect(securityAttackerRef.current.artId).toBe("BT24-018");
    expect(scene?.attacker?.cardId).toBe("BT24-018");
    expect(revealOnStageRef.current?.scene.attacker?.cardId).toBe("BT24-018");
  });

  it("leaves another permanent's digivolution alone", () => {
    const securityAttackerRef = {
      current: { seat: 1 as const, cardId: "BT24-011", artId: "BT24-011", permanentId: "perm-9" },
    };
    let scene: SecurityClashScene | null = sceneWithAttacker();
    const revealOnStageRef: { current: RevealOnStage | null } = { current: { key: 1, scene: sceneWithAttacker() } };
    refreshSecurityAttacker({
      fresh: [digivolved],
      securityAttackerRef,
      revealOnStageRef,
      setSecurityClash: (update) => {
        scene = typeof update === "function" ? update(scene) : update;
      },
    });
    expect(securityAttackerRef.current.artId).toBe("BT24-011");
    expect(scene?.attacker?.cardId).toBe("BT24-011");
    expect(revealOnStageRef.current?.scene.attacker?.cardId).toBe("BT24-011");
  });
});
