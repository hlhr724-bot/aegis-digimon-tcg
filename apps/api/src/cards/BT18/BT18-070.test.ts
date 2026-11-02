import { describe, expect, it } from "vitest";
import { EffectTiming, Phase } from "@aegis/shared";
import { effectsOf } from "../../engine/effects/collect.js";
import { passesPlacementGuard } from "../../engine/effects/kernel.js";
import { internalsOf } from "../../engine/testkit/internals.js";
import { observe } from "../../engine/testkit/observe.js";
import {
  setupEngine,
  settle,
  type CardSpec,
  type EngineSetup,
  type PermanentSpec,
  type SeatSpec,
  type SetupEngineOptions,
} from "../../engine/testkit/harness.js";
import "../BT13/BT13-007.js";
import "../BT5/BT5-091.js";
import "../BT9/BT9-090.js";
import { compiled } from "./BT18-070.js";
import "./BT18-067.js";
import "./BT18-070.js";
import "./BT18-091.js";

describe("BT18-070 RhinoKabuterimon", () => {
  it("uses its hand Main effect to place Beetlemon and MetalKabuterimon under a Tamer and digivolve it", async () => {
    expect(compiled.effects[0]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "DigivolveViaPlacement",
          placeCost: { target: { count: 2, requiredNamesExact: ["Beetlemon", "MetalKabuterimon"] } },
        },
      ],
    });
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-091", as: "tamer" }],
          hand: [{ card: "BT18-070", as: "rhino" }],
          trash: [
            { card: "BT18-063", as: "beetlemon" },
            { card: "BT18-067", as: "metalKabuterimon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const effects = JSON.parse(s.inst("rhino").activatableEffectsJson || "[]") as { effectKey: string }[];
    expect(effects).toHaveLength(1);

    s.state.phase = Phase.Main;
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("rhino").instanceId,
        effectKey: effects[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").topCard?.cardId === "BT18-070");
    await s.ready();

    expect(s.perm("tamer").topCard?.cardId).toBe("BT18-070");
    expect(s.perm("tamer").stack.map((card) => card.cardId)).toEqual(["BT18-063", "BT18-067", "BT18-091"]);
    expect(observe(s.engine).hasKeyword(s.perm("tamer"), "Collision")).toBe(true);
  });

  it("Discord 1555224478416633927: the player orders Beetlemon and MetalKabuterimon under the Tamer (CR 3-1-3-4)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-091", as: "tamer" }],
          hand: [{ card: "BT18-070", as: "rhino" }],
          trash: [
            { card: "BT18-063", as: "beetlemon" },
            { card: "BT18-067", as: "metalKabuterimon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: false },
    );
    s.state.memory = 10;
    await s.ready();
    const effects = JSON.parse(s.inst("rhino").activatableEffectsJson || "[]") as { effectKey: string }[];
    const beetlemonId = s.inst("beetlemon").instanceId;
    const metalKabuterimonId = s.inst("metalKabuterimon").instanceId;
    s.state.phase = Phase.Main;
    await s.engine.recomputeContinuousEffects();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("rhino").instanceId,
        effectKey: effects[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.decisions.some(({ req }) => req.kind === "orderCards"));
    const ordering = s.decisions.find(({ req }) => req.kind === "orderCards")!.req;
    expect(ordering.options?.orderDestination).toBe("stackBottom");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: ordering.decisionId,
        response: { kind: "orderCards", order: [beetlemonId, metalKabuterimonId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("tamer").topCard?.cardId === "BT18-070");

    expect(s.perm("tamer").stack.map((card) => card.instanceId)).toEqual([
      beetlemonId,
      metalKabuterimonId,
      s.inst("tamer").instanceId,
    ]);
  });

  it("requires one Beetlemon and one MetalKabuterimon rather than two same-name cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT18-091", as: "tamer" }],
          hand: [{ card: "BT18-070", as: "rhino" }],
          trash: [
            { card: "BT18-063", as: "firstBeetlemon" },
            { card: "BT18-063", as: "secondBeetlemon" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(JSON.parse(s.inst("rhino").activatableEffectsJson || "[]")).toHaveLength(0);
    const trashBefore = s.state.players[0]!.trash.map(({ instanceId }) => instanceId);

    expect(s.perm("tamer").topCard?.cardId).toBe("BT18-091");
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain("BT18-070");
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(trashBefore);
    expect(s.state.memory).toBe(10);
  });

  it("applies inherited once-per-turn -4000 DP to an opposing Digimon when the host attacks", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT1-030", as: "host", under: ["BT18-070"] }] },
        1: { battleArea: [{ card: "BT1-078", as: "target" }], security: ["BT1-010"] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    const targetInitialDP = s.perm("target").currentDP;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === targetInitialDP - 4000);

    expect(s.perm("target").currentDP).toBe(targetInitialDP - 4000);
  });
});

type RhinoBoard = {
  hand?: CardSpec[];
  trash?: CardSpec[];
  deck?: CardSpec[];
  battleArea?: PermanentSpec[];
  breeding?: PermanentSpec;
};

const TAMER: PermanentSpec = { card: "BT18-091", as: "tamer" };
const RHINO_IN_HAND: CardSpec = { card: "BT18-070", as: "rhino" };
const PLACEMENT_MATERIALS: CardSpec[] = [
  { card: "BT18-063", as: "beetlemon" },
  { card: "BT18-067", as: "metalKabuterimon" },
];

async function setupRhino(board: RhinoBoard, opponent: SeatSpec = {}, options: SetupEngineOptions = {}) {
  const s = setupEngine(
    {
      0: {
        battleArea: board.battleArea ?? [TAMER],
        hand: board.hand ?? [RHINO_IN_HAND],
        trash: board.trash ?? PLACEMENT_MATERIALS,
        deck: board.deck ?? ["BT1-009", "BT1-013", "BT1-009"],
        breeding: board.breeding,
        security: 3,
      },
      1: { security: 3, deck: ["BT1-009", "BT1-013"], ...opponent },
    },
    { autoAcceptOptional: true, autoSelectCards: true, ...options },
  );
  s.state.memory = 10;
  s.state.phase = Phase.Main;
  await s.ready();
  await s.engine.recomputeContinuousEffects();
  return s;
}

function handEffectKeys(s: EngineSetup, alias: string): string[] {
  return (JSON.parse(s.inst(alias).activatableEffectsJson || "[]") as { effectKey: string }[]).map(
    ({ effectKey }) => effectKey,
  );
}

function activate(s: EngineSetup, alias: string, effectKey: string) {
  return s.engine.applyIntent(0, {
    type: "activateEffect",
    sourceInstanceId: s.inst(alias).instanceId,
    effectKey,
  });
}

async function digivolveTamerFromHand(s: EngineSetup) {
  const [effectKey] = handEffectKeys(s, "rhino");
  expect(effectKey).toBeDefined();
  expect(activate(s, "rhino", effectKey!)).toEqual({ ok: true });
  await settle(() => s.perm("tamer").topCard?.cardId === "BT18-070");
  await s.ready();
  expect(s.perm("tamer").topCard?.cardId).toBe("BT18-070");
}

describe("BT18-070 RhinoKabuterimon — KB Q&A rulings", () => {
  it("offers its [Hand] [Main] effect only while the card is in the hand (Q3009)", async () => {
    const inHand = await setupRhino({});
    const [handEffectKey] = handEffectKeys(inHand, "rhino");
    expect(handEffectKey).toBeDefined();

    const inTrash = await setupRhino({
      hand: [],
      trash: [{ card: "BT18-070", as: "rhino" }, ...PLACEMENT_MATERIALS],
    });
    expect(handEffectKeys(inTrash, "rhino")).toEqual([]);
    expect(activate(inTrash, "rhino", handEffectKey!).ok).toBe(false);
    await inTrash.ready();
    expect(inTrash.perm("tamer").topCard?.cardId).toBe("BT18-091");
    expect(inTrash.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT18-070");
  });

  it("cannot digivolve the Tamer by placing only [Beetlemon] without [MetalKabuterimon] (Q3010)", async () => {
    const s = await setupRhino({ trash: [{ card: "BT18-063", as: "beetlemon" }] });
    const [effectKey] = handEffectKeys(s, "rhino");
    const handBefore = s.state.players[0]!.hand.map(({ instanceId }) => instanceId);

    if (effectKey !== undefined) {
      activate(s, "rhino", effectKey);
      await s.ready();
    }

    expect(s.perm("tamer").topCard?.cardId).toBe("BT18-091");
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).toEqual([]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("beetlemon").instanceId]);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(handBefore);
    expect(s.state.memory).toBe(10);
  });

  it("digivolves the Tamer as-is: ignores 'Digimon can't digivolve' and skips 'would digivolve' and 'digivolves' watchers (Q3011)", async () => {
    const lockAndWatchers: RhinoBoard = {
      battleArea: [TAMER, { card: "BT5-091", as: "takumi" }, { card: "BT9-090", as: "maki" }],
      breeding: { card: "BT13-007", as: "kingDrasil" },
    };
    const s = await setupRhino({
      ...lockAndWatchers,
      battleArea: [...lockAndWatchers.battleArea!, { card: "BT18-063", as: "lockedBeetlemon" }],
      hand: [RHINO_IN_HAND, { card: "BT18-070", as: "lockedRhino" }],
    });

    await digivolveTamerFromHand(s);

    expect(s.perm("takumi").isSuspended).toBe(false);
    expect(s.perm("maki").isSuspended).toBe(false);
    expect(s.state.memory).toBe(7);
    const lockedDigivolve = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("lockedBeetlemon").permanentId,
      instanceId: s.inst("lockedRhino").instanceId,
    });
    expect(lockedDigivolve.ok).toBe(false);

    const control = await setupRhino({
      ...lockAndWatchers,
      breeding: undefined,
      battleArea: [...lockAndWatchers.battleArea!, { card: "BT18-063", as: "beetlemonOnField" }],
      hand: [{ card: "BT18-070", as: "rhinoByRequirement" }],
    });
    expect(
      control.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: control.perm("beetlemonOnField").permanentId,
        instanceId: control.inst("rhinoByRequirement").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => control.perm("takumi").isSuspended);
    expect(control.perm("takumi").isSuspended).toBe(true);
    expect(control.perm("maki").isSuspended).toBe(true);
  });

  it("performs the digivolution bonus draw when the Tamer digivolves (Q3012)", async () => {
    const s = await setupRhino({ deck: [{ card: "BT1-009", as: "drawn" }, "BT1-013"] });

    await digivolveTamerFromHand(s);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("drawn").instanceId]);
    expect(s.state.memory).toBe(7);
  });

  it("cannot attack the turn it digivolves from a Tamer played that turn (Q3013)", async () => {
    const attackPlayer = (s: EngineSetup) =>
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("tamer").permanentId,
        target: { kind: "player" },
      });

    const fresh = await setupRhino({ battleArea: [], hand: [RHINO_IN_HAND, { card: "BT18-091", as: "tamer" }] });
    expect(fresh.engine.applyIntent(0, { type: "playCard", instanceId: fresh.inst("tamer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => fresh.state.players[0]!.battleArea.length === 1);
    await fresh.ready();
    await digivolveTamerFromHand(fresh);
    expect(fresh.state.memory).toBe(3);
    expect(attackPlayer(fresh).ok).toBe(false);
    expect(fresh.perm("tamer").isSuspended).toBe(false);

    const established = await setupRhino({});
    await digivolveTamerFromHand(established);
    expect(attackPlayer(established)).toEqual({ ok: true });
  });

  it("keeps the Tamer as a digivolution card that is trashed when the Digimon leaves play (Q6646)", async () => {
    const s = await setupRhino(
      {},
      { battleArea: [{ card: "BT1-078", as: "wall", dp: 20000, suspended: true }] },
      // Beetlemon's inherited effect would otherwise replay the Tamer from the leaving stack.
      { declinePrompts: ["Play without paying the cost"] },
    );

    await digivolveTamerFromHand(s);
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).toContain("BT18-091");

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("tamer").permanentId,
        target: { kind: "permanent", permanentId: s.perm("wall").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 0);

    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId).sort()).toEqual(
      ["BT18-063", "BT18-067", "BT18-070", "BT18-091"].sort(),
    );
  });

  it("does not gain the [Security] effect of a Tamer in its digivolution cards (Q6647)", async () => {
    const attackPlayer = async (s: EngineSetup) => {
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("rhino").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.security.length === 0);
      await s.ready();
    };
    const tamersInPlay = (s: EngineSetup) =>
      s.state.players[0]!.battleArea.filter(({ topCard }) => topCard?.cardId === "BT18-091");

    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT18-070", as: "rhino", under: [{ card: "BT18-091", as: "tamerSource" }] }] },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await attackPlayer(s);

    expect(s.perm("rhino").stack.map(({ instanceId }) => instanceId)).toContain(s.inst("tamerSource").instanceId);
    expect(tamersInPlay(s)).toHaveLength(0);

    const internals = internalsOf(s.engine);
    const buriedTamer = internals.cardSourceOf(s.inst("tamerSource"));
    const buriedSecurityEffects = effectsOf(EffectTiming.SecuritySkill, buriedTamer);
    expect(buriedSecurityEffects).not.toHaveLength(0);
    expect(
      buriedSecurityEffects.map((effect) =>
        passesPlacementGuard(effect, internals.buildEffectContext(buriedTamer, {})),
      ),
    ).toEqual(buriedSecurityEffects.map(() => false));
    expect(observe(s.engine).canUseInheritedEffect(s.perm("rhino"), "BT18-091")).toBe(true);

    const control = setupEngine(
      {
        0: { battleArea: [{ card: "BT18-070", as: "rhino" }] },
        1: { security: [{ card: "BT18-091", as: "securityTamer" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await control.ready();
    await attackPlayer(control);
    await settle(() => control.state.players[1]!.battleArea.length === 1);

    expect(control.state.players[1]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toEqual([
      control.inst("securityTamer").instanceId,
    ]);
  });

  it("gains the inherited effect of a Tamer in its digivolution cards (Q6648)", async () => {
    const blockedAttack = async (under: CardSpec[]) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT18-070", as: "rhino", under }],
            hand: [{ card: "BT18-091", as: "handTamer" }],
          },
          1: { battleArea: [{ card: "BT1-078", as: "blocker", dp: 1000 }], security: ["BT1-009"] },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("rhino").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
      expect(
        s.engine.applyIntent(1, { type: "declareBlock", blockerPermanentId: s.perm("blocker").permanentId }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.length === 0);
      await s.ready();
      return s;
    };

    const withTamer = await blockedAttack(["BT18-091"]);
    expect(withTamer.state.players[0]!.battleArea.map(({ topCard }) => topCard?.instanceId)).toContain(
      withTamer.inst("handTamer").instanceId,
    );
    expect(withTamer.state.players[0]!.hand).toHaveLength(0);

    const withoutTamer = await blockedAttack([]);
    expect(withoutTamer.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      withoutTamer.inst("handTamer").instanceId,
    ]);
    expect(withoutTamer.state.players[0]!.battleArea).toHaveLength(1);
  });
});
