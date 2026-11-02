import { Permanent } from "@aegis/shared/schema/Permanent";
import { describe, expect, it } from "vitest";
import { restrictionBadges } from "@/game/fieldBadges";
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
