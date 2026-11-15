import { CardInstance, Permanent, PlayerState } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { prePlayPromptFor } from "./prePlayPrompt";

function viewerWithTaiki(cannotSuspend: boolean) {
  const viewer = new PlayerState();
  const played = Object.assign(new CardInstance(), { instanceId: "played-xros", cardId: "BT10-009" });
  viewer.hand.push(played);
  const taiki = Object.assign(new Permanent(), {
    permanentId: "taiki",
    topCard: Object.assign(new CardInstance(), { instanceId: "taiki-card", cardId: "BT19-079" }),
    cannotSuspend,
  });
  taiki.stack.push(Object.assign(new CardInstance(), { instanceId: "under-shoutmon", cardId: "BT10-008" }));
  viewer.battleArea.push(taiki);
  return { viewer, played };
}

function expanderIds(cannotSuspend: boolean) {
  const { viewer, played } = viewerWithTaiki(cannotSuspend);
  const prompt = prePlayPromptFor({
    entry: {
      instanceId: played.instanceId,
      cardId: played.cardId,
      activatableEffectsJson: "",
      playableFromHand: true,
      projectedPlayCost: 7,
      digivolveTargetPermanentIds: [],
      linkTargetPermanentIds: [],
    },
    viewer,
    confirmDrop: false,
    actionConfirmationsEnabled: false,
  });
  if (prompt?.kind !== "digiXros") throw new Error("Expected a DigiXros preparation");
  return prompt.eligibleExpanders.map(({ permanentId }) => permanentId);
}

describe("DigiXros expander Tamers", () => {
  it("offers an unsuspended Taiki that can pay its suspension cost", () => {
    expect(expanderIds(false)).toEqual(["taiki"]);
  });

  it("does not offer a Taiki locked by a can't-suspend effect", () => {
    expect(expanderIds(true)).toEqual([]);
  });
});

function dualOptionPrompt(playableFromHand: boolean) {
  return prePlayPromptFor({
    entry: {
      instanceId: "dual-option",
      cardId: "EX13-066",
      activatableEffectsJson: "",
      playableFromHand,
      projectedPlayCost: playableFromHand ? 5 : -1,
      digivolveTargetPermanentIds: [],
      linkTargetPermanentIds: [],
    },
    viewer: new PlayerState(),
    confirmDrop: true,
    actionConfirmationsEnabled: true,
  });
}

describe("dual card Option prompt", () => {
  it("asks to use the Option side when the server projects the card as usable", () => {
    expect(dualOptionPrompt(true)).toEqual({ kind: "dual", instanceId: "dual-option", cardId: "EX13-066" });
  });

  it("asks nothing when the server projects the Option as unusable, so its refusal reaches the player", () => {
    expect(dualOptionPrompt(false)).toBeUndefined();
  });
});
