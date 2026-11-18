import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { describe, expect, it } from "vitest";
import { restrictionBadges, sourceCountBadge } from "@/game/fieldBadges";
import { readStatusFlags } from "@/game/match/watchers/readStatusFlags";

describe("stack protection badges", () => {
  it("shows each server-projected stack protection independently and clears expired protections", () => {
    const permanent = new Permanent();
    expect(restrictionBadges(permanent)).toEqual([]);
    permanent.protectedFromStackTrash = true;
    expect(restrictionBadges(permanent).map(({ kind }) => kind)).toEqual(["protectedFromStackTrash"]);
    permanent.protectedFromStackReturn = true;
    expect(restrictionBadges(permanent)).toEqual([
      expect.objectContaining({ kind: "protectedFromStackTrash", protection: true }),
      expect.objectContaining({ kind: "protectedFromStackReturn", protection: true }),
    ]);
    expect(readStatusFlags(permanent).buffs).toBe(2);
    permanent.protectedFromStackTrash = false;
    expect(restrictionBadges(permanent).map(({ kind }) => kind)).toEqual(["protectedFromStackReturn"]);
    permanent.protectedFromStackReturn = false;
    expect(restrictionBadges(permanent)).toEqual([]);
    expect(readStatusFlags(permanent).buffs).toBe(0);
  });
});

it("keeps battle protection and unsuspend restrictions visible independently", () => {
  const permanent = new Permanent();
  permanent.protectedFromBattleDeletion = true;
  permanent.cannotUnsuspend = true;
  expect(restrictionBadges(permanent).map(({ kind }) => kind)).toEqual([
    "protectedFromBattleDeletion",
    "cannotUnsuspend",
  ]);
  expect(readStatusFlags(permanent)).toMatchObject({ buffs: 1, debuffs: 1 });
});

it("labels deletion protection that still allows battle deletion apart from battle protection", () => {
  const permanent = new Permanent();
  permanent.protectedFromEffectDeletion = true;
  expect(restrictionBadges(permanent)).toEqual([
    expect.objectContaining({
      kind: "protectedFromEffectDeletion",
      labelKey: "game.restriction.protectedFromEffectDeletion",
    }),
  ]);
  permanent.protectedFromBattleDeletion = true;
  expect(restrictionBadges(permanent).map(({ labelKey }) => labelKey)).toEqual([
    "game.restriction.protectedFromBattleDeletion",
    "game.restriction.protectedFromEffectDeletion",
  ]);
  expect(readStatusFlags(permanent).buffs).toBe(2);
});

it("tells a lock on the unsuspend phase apart from a Digimon that can't unsuspend at all", () => {
  const permanent = new Permanent();
  permanent.cannotUnsuspend = true;
  expect(restrictionBadges(permanent).map(({ labelKey }) => labelKey)).toEqual(["game.restriction.cannotUnsuspend"]);
  permanent.cannotUnsuspendAtAll = true;
  expect(restrictionBadges(permanent).map(({ labelKey }) => labelKey)).toEqual([
    "game.restriction.cannotUnsuspendAtAll",
  ]);
});

it("shows a can't-attack-players chip unless the Digimon can't attack at all", () => {
  const permanent = new Permanent();
  permanent.cannotAttackPlayers = true;
  expect(restrictionBadges(permanent).map(({ kind }) => kind)).toEqual(["cannotAttackPlayers"]);
  permanent.cannotAttack = true;
  expect(restrictionBadges(permanent).map(({ kind }) => kind)).toEqual(["cannotAttack"]);
});

it("counts the face-down cards in a stack without identifying them", () => {
  const permanent = new Permanent();
  expect(sourceCountBadge(permanent)).toBeNull();
  permanent.stack.push(
    Object.assign(new CardInstance(), { instanceId: "open", cardId: "BT1-010", faceUp: true }),
    Object.assign(new CardInstance(), { instanceId: "hidden-1", faceUp: false }),
    Object.assign(new CardInstance(), { instanceId: "hidden-2", faceUp: false }),
  );
  expect(sourceCountBadge(permanent)).toMatchObject({ count: 3, faceDown: 2 });
});
