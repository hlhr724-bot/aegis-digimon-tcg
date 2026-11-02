import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled } from "./BT9-050.js";

describe("BT9-050 Leomon (X Antibody)", () => {
  it("matches catalog and Q1847 exact-name battle-replacement IR", () => {
    expect(getCardDefinition("BT9-050")).toMatchObject({
      cardId: "BT9-050",
      nameEn: "Leomon (X Antibody)",
      colors: ["Green", "Blue"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      evoCosts: [
        { color: "Green", level: 3, memoryCost: 2 },
        { color: "Blue", level: 3, memoryCost: 2 },
      ],
      forms: ["Champion"],
      attributes: ["Vaccine"],
      types: ["Beastkin", "X Antibody"],
    });
    expect(compiled).toMatchObject({
      coverage: "full",
      residual: [],
      digivolutionRequirement: [{ names: ["Leomon"], cost: 0, isAlternate: true }],
      effects: [
        {
          trigger: "AllTurns",
          actions: [
            {
              kind: "Replacement",
              event: "wouldBeDeleted",
              mode: "instead",
              leaveCause: "byBattle",
              actions: [
                {
                  kind: "PlayWithoutCost",
                  from: ["digivolutionCards"],
                  payCost: false,
                  optional: true,
                  target: { filter: { nameOrTrait: [{ tokens: ["Leomon"], match: "nameExact" }] } },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("may play a Leomon source before its host is deleted in battle", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT9-050", as: "host", under: [{ card: "BT1-035", as: "leomon" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const leomonId = s.perm("host").stack[0]!.instanceId;
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byBattle");
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === leomonId)).toBe(true);
  });

  it("announces the battle replacement only when its optional play is accepted", async () => {
    const announcements = (s: EngineSetup) =>
      s.events.flatMap((event) =>
        (event.kind === "effectTriggered" || event.kind === "effectResolved") && event.sourceCardId === "BT9-050"
          ? [event.kind]
          : [],
      );
    const declined = setupEngine(
      { 0: { battleArea: [{ card: "BT9-050", as: "host", under: [{ card: "BT1-035", as: "leomon" }] }] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const declinedLeomonId = declined.inst("leomon").instanceId;
    expect(await advance(declined.engine).verb.deletePermanent([declined.perm("host").permanentId], "byBattle")).toBe(
      1,
    );
    expect(declined.decisions.map(({ req }) => req.kind)).toEqual(["optional"]);
    expect(declined.state.players[0]!.battleArea).toHaveLength(0);
    expect(declined.state.players[0]!.trash.map((card) => card.instanceId)).toContain(declinedLeomonId);
    expect(announcements(declined)).toEqual([]);

    const accepted = setupEngine(
      { 0: { battleArea: [{ card: "BT9-050", as: "host", under: [{ card: "BT1-035", as: "leomon" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const acceptedLeomonId = accepted.inst("leomon").instanceId;
    await advance(accepted.engine).verb.deletePermanent([accepted.perm("host").permanentId], "byBattle");
    expect(accepted.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      acceptedLeomonId,
    ]);
    expect(announcements(accepted)).toEqual(["effectTriggered", "effectResolved"]);
    const triggeredAt = accepted.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT9-050",
    );
    const playedAt = accepted.events.findIndex(
      (event) => event.kind === "cardPlayed" && event.instanceId === acceptedLeomonId,
    );
    expect(triggeredAt).toBeGreaterThanOrEqual(0);
    expect(triggeredAt).toBeLessThan(playedAt);
  });

  it("does not play Leomon (X Antibody) when the replacement requires exact Leomon", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "BT9-050", as: "host", under: [{ card: "BT9-050", as: "xLeomon" }] }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const xLeomonId = s.inst("xLeomon").instanceId;
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byBattle");

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === xLeomonId)).toBe(false);
  });
});
