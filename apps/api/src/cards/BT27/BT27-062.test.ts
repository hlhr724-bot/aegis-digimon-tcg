import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-062.js";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const cardId = "BT27-062";
const gladimon = "BT18-062";
const fistOfAthena = "BT18-099";
const vanillaBlackLevel4 = "BT10-062";
const vanillaBlackLevel5 = "BT10-064";

function handIds(s: Session) {
  return s.state.players[0]!.hand.map(({ instanceId }) => instanceId);
}

function battleAreaTops(s: Session, seat: 0 | 1 = 0) {
  return s.state.players[seat]!.battleArea.map(({ topCard }) => topCard.instanceId);
}

async function attackWithMaildramon(s: Session) {
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm("maildramon").permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
}

describe("BT27-062 Maildramon", () => {
  it("matches the catalog and compiles every printed clause", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "Maildramon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 4000,
      evoCosts: [{ color: "Black", level: 3, memoryCost: 2 }],
      forms: ["Armor Form"],
      attributes: ["Free"],
      types: ["Cyborg"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map((effect) => [effect.trigger, effect.frequency, effect.isInherited])).toEqual([
      ["WhenAttacking", "OncePerTurn", undefined],
      ["AllTurns", "OncePerTurn", true],
    ]);
  });

  it("when attacking, plays a [Knightmon]-text Digimon from hand with the cost reduced by 2", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "maildramon" }],
          hand: [
            { card: vanillaBlackLevel4, as: "plain" },
            { card: gladimon, as: "gladimon" },
          ],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferInstanceIds: preferred },
    );
    await s.ready();
    s.state.memory = 5;
    preferred.push(s.inst("gladimon").instanceId);

    await attackWithMaildramon(s);
    await settle(() => battleAreaTops(s).includes(s.inst("gladimon").instanceId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(2);
    expect(handIds(s)).toEqual([s.inst("plain").instanceId]);
    assertNoLoudGap(s);
  });

  it("when attacking, uses a [Knightmon]-text Option from hand with the cost reduced by 2", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "maildramon" }],
          hand: [{ card: fistOfAthena, as: "fist" }],
          security: ["BT1-009"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "rival" }],
          security: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1 },
    );
    await s.ready();
    s.state.memory = 5;
    const fistId = s.inst("fist").instanceId;

    await attackWithMaildramon(s);
    await settle(() => !handIds(s).includes(fistId));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(4);
    expect(battleAreaTops(s)).toContain(fistId);
    assertNoLoudGap(s);
  });

  it("ignores cards without [Knightmon] in their text and lets the player decline", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "maildramon" }],
          hand: [
            { card: vanillaBlackLevel4, as: "plain" },
            { card: gladimon, as: "gladimon" },
          ],
          security: ["BT1-009"],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoDeclineOptional: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.memory = 5;

    await attackWithMaildramon(s);
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(5);
    expect(handIds(s)).toEqual([s.inst("plain").instanceId, s.inst("gladimon").instanceId]);
  });

  it("inherited: deletes another [Knightmon]-text Digimon so its host does not leave", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: vanillaBlackLevel5, as: "host", under: [{ card: cardId, as: "maildramon" }] },
            { card: vanillaBlackLevel4, as: "plain" },
            { card: gladimon, as: "gladimon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.perm("gladimon").topCard.instanceId);
    const hostId = s.perm("host").permanentId;

    await advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle();

    const remaining = s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId);
    expect(remaining).toEqual([hostId, s.perm("plain").permanentId]);
    expect(s.state.players[0]!.trash.map(({ cardId: trashed }) => trashed)).toEqual([gladimon]);
    assertNoLoudGap(s);
  });

  it("inherited: the host leaves when no other [Knightmon]-text Digimon can be deleted", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: vanillaBlackLevel5, as: "host", under: [{ card: cardId, as: "maildramon" }] },
            { card: vanillaBlackLevel4, as: "plain" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    await advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([s.perm("plain").permanentId]);
    expect(s.state.players[0]!.trash.map(({ cardId: trashed }) => trashed).sort()).toEqual(
      [cardId, vanillaBlackLevel5].sort(),
    );
  });

  it("inherited: prevents leaving only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: vanillaBlackLevel5, as: "host", under: [{ card: cardId, as: "maildramon" }] },
            { card: gladimon, as: "first" },
            { card: "BT18-069", as: "second" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const hostId = s.perm("host").permanentId;

    await advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle();
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(hostId);

    await advance(s.engine).verb.deletePermanent([hostId], "byEffect");
    await settle();
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).not.toContain(hostId);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
  });
});
