import { describe, expect, it } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { Zone, type Permanent } from "@aegis/shared";
import { setupEngine } from "../testkit/harness.js";
import { createCardStateLookup } from "./context.js";
import { extractCardById, extractPermanentAt, pushOnStack, setBreeding } from "../state/access.js";
import "../../cards/index.js";

describe("card state lookup", () => {
  it("follows a card from the hand into a digivolution stack and off the field", () => {
    const s = setupEngine({
      0: { hand: [{ card: "BT1-020", as: "loose" }], battleArea: [{ card: "BT1-010", as: "holder" }] },
    });
    const lookup = createCardStateLookup(s.state);
    const loose = s.inst("loose").instanceId;
    const holder = s.perm("holder");
    expect(lookup.permanentOf(loose)).toBeUndefined();
    expect(lookup.permanentOf(holder.topCard.instanceId)).toBe(holder);

    pushOnStack(holder, extractCardById(s.state.players[0]!, Zone.Hand, loose)!);
    expect(lookup.permanentOf(loose)).toBe(holder);
    expect(lookup.isOnBattleArea(loose)).toBe(true);

    extractPermanentAt(s.state.players[0]!, 0);
    expect(lookup.permanentOf(loose)).toBeUndefined();
    expect(lookup.isOnBattleArea(holder.topCard.instanceId)).toBe(false);
  });

  it("reports a permanent moved into the breeding area as breeding, not battle area", () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-010", as: "holder" }] } });
    const lookup = createCardStateLookup(s.state);
    const holder = s.perm("holder");
    const top = holder.topCard.instanceId;
    expect(lookup.isOnBattleArea(top)).toBe(true);

    extractPermanentAt(s.state.players[0]!, 0);
    setBreeding(s.state.players[0]!, holder);
    expect(lookup.isOnBattleArea(top)).toBe(false);
    expect(lookup.isOnBreedingArea?.(top)).toBe(true);
  });

  it("sees a battle area that was replaced as a whole", () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-010", as: "holder" }] } });
    const lookup = createCardStateLookup(s.state);
    const top = s.perm("holder").topCard.instanceId;
    expect(lookup.isOnBattleArea(top)).toBe(true);

    s.state.players[0]!.battleArea = new ArraySchema<Permanent>();
    expect(lookup.isOnBattleArea(top)).toBe(false);
  });
});
