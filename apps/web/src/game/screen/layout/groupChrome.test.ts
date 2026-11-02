import { expect, it } from "vitest";
import { CardInstance, Permanent } from "@aegis/shared";
import type { PermanentChrome } from "../types";
import { arrangeField } from "../model/fieldArrangement";
import { groupChrome } from "./groupChrome";
import { isSingledOut } from "./singledOut";

function tamer(id: string, suspended: boolean) {
  const permanent = new Permanent();
  permanent.permanentId = id;
  permanent.topCard = new CardInstance();
  permanent.topCard.cardId = "BT1-088";
  permanent.topCard.instanceId = `${id}-card`;
  permanent.isSuspended = suspended;
  return permanent;
}

function chrome(): PermanentChrome {
  return {
    compact: false,
    width: 100,
    permanentRefs: { current: {} },
    effectSourcePermanentIds: new Set(),
    effectLinkedPermanentIds: new Set(),
    decisionPickedInstanceIds: new Set(),
    permanentBursts: new Map(),
    pendingPermanentIds: new Set(),
    fateBadges: new Map(),
    combatImpactIds: new Set(),
    dpPulses: new Map(),
    dpBadgeSuppressedIds: new Set(),
    freezePulses: new Map(),
    heldSuspendedIds: new Set(),
    suspendDelayMs: () => 0,
  };
}

it("animates a hidden suspended copy on its group while leaving the third copy available", () => {
  const cards = [tamer("first", true), tamer("second", true), tamer("third", false)];
  const cues = chrome();
  cues.effectSourcePermanentIds = new Set(["second"]);
  cues.effectLinkedPermanentIds = new Set(["second"]);
  const burst = {
    permanentId: "second",
    key: 2,
    seat: 0 as const,
    variant: "evolve" as const,
    color: "Green" as const,
    inBreeding: false,
  };
  cues.permanentBursts = new Map([["second", burst]]);
  const arrangement = arrangeField(cards, {
    isSuspended: (p) => p.isSuspended,
    isSingledOut: (p) => isSingledOut(p, cues),
  });
  expect(arrangement.support).toHaveLength(2);
  const suspended = arrangement.support.find((group) => group.members[0]!.isSuspended)!;
  expect(suspended.members.map((p) => p.permanentId)).toEqual(["first", "second"]);
  expect(groupChrome(suspended.members, cues)).toMatchObject({ effectSource: true, effectLinked: true, burst });
  expect(groupChrome([cards[2]!], cues)).toMatchObject({ effectSource: false, effectLinked: false, burst: undefined });
});

it("keeps a played copy in its flight destination through landing, then joins its existing group", () => {
  const cards = [tamer("first", false), tamer("second", false), tamer("arriving", false)];
  const cues = chrome();
  const groups = () =>
    arrangeField(cards, {
      isSuspended: (p) => p.isSuspended,
      isSingledOut: (p) => isSingledOut(p, cues),
    }).support.map((group) => group.members.map((p) => p.permanentId));
  cues.pendingPermanentIds = new Set(["arriving"]);
  expect(groups()).toEqual([["first", "second"], ["arriving"]]);
  cues.pendingPermanentIds = new Set();
  cues.permanentBursts = new Map([
    ["arriving", { permanentId: "arriving", key: 1, seat: 0, variant: "play", color: "Green", inBreeding: false }],
  ]);
  expect(groups()).toEqual([["first", "second"], ["arriving"]]);
  expect(groupChrome([cards[2]!], cues).burst?.permanentId).toBe("arriving");
  cues.permanentBursts = new Map();
  expect(groups()).toEqual([["first", "second", "arriving"]]);
});

it("restarts the group pulse when a different copy gets a newer cue", () => {
  const cards = [tamer("first", true), tamer("second", true)];
  const cues = chrome();
  const older = { permanentId: "first", key: 1, kind: "cannotAttack" as const };
  const newer = { permanentId: "second", key: 2, kind: "cannotAttack" as const };
  cues.freezePulses = new Map([
    ["first", older],
    ["second", newer],
  ]);
  expect(groupChrome(cards, cues).freezePulse).toBe(newer);
});

it("still exposes a particular copy when the player must choose it", () => {
  const cards = [tamer("first", true), tamer("second", true)];
  const cues = chrome();
  cues.decisionPickedInstanceIds = new Set(["second-card"]);
  const arrangement = arrangeField(cards, {
    isSuspended: (p) => p.isSuspended,
    isSingledOut: (p) => isSingledOut(p, cues),
  });
  expect(arrangement.support.map((group) => group.members.map((p) => p.permanentId))).toEqual([["first"], ["second"]]);
});
