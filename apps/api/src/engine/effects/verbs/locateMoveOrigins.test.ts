import { describe, expect, it } from "vitest";
import { setupEngine } from "#api/engine/testkit/harness";
import { withCheckedCard } from "#api/engine/security/checkedCard";
import { locateMoveOrigins } from "#api/engine/effects/verbs/locateMoveOrigins";

describe("movement origin snapshots", () => {
  it("names loose zones, controllers, breeding and attachment hosts before mutation", () => {
    const setup = setupEngine({
      0: {
        hand: [{ card: "ST1-03", as: "hand" }],
        deck: [{ card: "ST1-03", as: "deck" }],
        trash: [{ card: "ST1-03", as: "trash" }],
        security: [{ card: "ST1-03", as: "security" }],
        breeding: { card: "ST1-03", as: "breeding" },
      },
      1: {
        battleArea: [
          {
            card: "ST1-07",
            as: "host",
            under: [{ card: "ST1-03", as: "source" }],
            linked: [{ card: "ST1-03", as: "link" }],
          },
        ],
      },
    });
    const aliases = ["hand", "deck", "trash", "security", "breeding", "host", "source", "link"];
    const origins = locateMoveOrigins({
      state: setup.state,
      instanceIds: [...aliases.map((alias) => setup.inst(alias).instanceId), "missing"],
    });
    for (const zone of ["hand", "deck", "trash", "security", "breeding"]) {
      expect(origins.get(setup.inst(zone).instanceId)).toEqual({ from: zone, fromSeat: 0 });
    }
    expect(origins.get(setup.inst("host").instanceId)).toEqual({ from: "battleArea", fromSeat: 1 });
    for (const [alias, from] of [
      ["source", "digivolutionCards"],
      ["link", "linkedCards"],
    ]) {
      expect(origins.get(setup.inst(alias!).instanceId)).toEqual({
        from,
        fromSeat: 1,
        fromHost: { permanentId: setup.perm("host").permanentId, hostCardId: "ST1-07" },
      });
    }
    expect(origins.has("missing")).toBe(false);
    setup.perm("host").topCard.cardId = "ST1-11";
    expect(origins.get(setup.inst("source").instanceId)?.fromHost?.hostCardId).toBe("ST1-07");
  });

  it("distinguishes a security check from an ordinary security return and a resolving option", async () => {
    const setup = setupEngine({
      0: { hand: [{ card: "ST1-16", as: "option" }], security: [{ card: "ST1-03", as: "security" }] },
    });
    const option = setup.inst("option");
    setup.state.players[0]!.hand.splice(0, 1);
    setup.state.players[0]!.resolvingOption = option;
    const security = setup.inst("security");
    const ids = [option.instanceId, security.instanceId];
    const ordinary = locateMoveOrigins({ state: setup.state, instanceIds: ids });
    expect(ordinary.get(option.instanceId)).toEqual({ from: "resolvingOption", fromSeat: 0 });
    expect(ordinary.get(security.instanceId)).toEqual({ from: "security", fromSeat: 0 });
    await withCheckedCard(setup.state, { card: security, seat: 0 }, async () => {
      expect(locateMoveOrigins({ state: setup.state, instanceIds: ids }).get(security.instanceId)).toEqual({
        from: "security",
        fromSeat: 0,
        fromSecurityCheck: true,
      });
    });
  });
});
