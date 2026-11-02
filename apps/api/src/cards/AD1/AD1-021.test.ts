import { EffectDuration, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { matchNameOrTrait } from "../../engine/effects/interpreter/matching/definition.js";
import { registeredCompiledCards } from "../../engine/effects/interpreter/compiledCards.js";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./AD1-021.js";
import "../BT1/BT1-015.js";
import "../BT13/BT13-008.js";
import "../BT13/BT13-095.js";
import "../BT15/BT15-083.js";
import "../BT18/BT18-059.js";
import "../BT21/BT21-044.js";
import "../BT21/BT21-096.js";
import "../BT5/BT5-031.js";
import "../P/P-095.js";

describe("AD1-021 Marcus Damon & Agumon", () => {
  const compiled = registeredCompiledCards.get("AD1-021");

  it("plays from security without paying its cost", async () => {
    const s = setupEngine({
      0: { security: [{ card: "AD1-021", as: "securityMarcus" }] },
      1: { battleArea: [{ card: "BT1-013", as: "attacker", dp: 20000 }] },
    });

    s.state.turnSeat = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("securityMarcus").instanceId,
      ),
    );

    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard?.instanceId === s.inst("securityMarcus").instanceId,
      ),
    ).toBe(true);
  });

  it("is registered as fully covered compiled IR", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("draws and may digivolve for 3 less only when this Tamer suspends", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-021", as: "tamer" },
            { card: "BT12-042", as: "rize" },
          ],
          hand: [{ card: "AD1-016", as: "shine" }],
          deck: [
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 3;

    await advance(s.engine).verb.suspend([s.perm("tamer").permanentId]);
    await settle(() => s.perm("rize").topCard.cardId === "AD1-016");

    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.state.memory).toBe(2);
  });

  it("turns only the chosen Marcus into a restricted 6000 DP Rush Digimon, then attacks once", async () => {
    const preferInstanceIds: string[] = [];
    const snapshots: Array<{ attackerId?: string; dp: number; rush: boolean; restricted: boolean }> = [];
    let engineRef: ReturnType<typeof setupEngine>["engine"] | undefined;
    let stateRef: ReturnType<typeof setupEngine>["state"] | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-021", as: "marcus" },
            { card: "BT12-034", as: "agumon" },
          ],
          hand: ["BT1-009", "BT1-010"],
          deck: [
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
            "BT1-009",
          ],
        },
        1: {
          security: [
            "BT1-009",
            "BT1-009",
            "BT1-010",
            "BT1-011",
            "BT1-012",
            "BT1-013",
            "BT1-014",
            "BT1-009",
            "BT1-010",
            "BT1-011",
          ],
          hand: ["BT1-013"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds,
        onEvent: (event) => {
          if (event.kind === "attackDeclared" && engineRef !== undefined) {
            const marcus = stateRef?.players[0]!.battleArea.find((p) => p.topCard?.cardId === "AD1-021");
            if (marcus !== undefined)
              snapshots.push({
                attackerId: event.attackerPermanentId,
                dp: marcus.currentDP,
                rush: observe(engineRef).hasKeyword(marcus, "Rush"),
                restricted: observe(engineRef).isRestricted(marcus, "digivolve"),
              });
          }
        },
      },
    );
    engineRef = s.engine;
    stateRef = s.state;
    preferInstanceIds.push(s.perm("marcus").topCard!.instanceId);
    const marcusPermanentId = s.perm("marcus").permanentId;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);

    const view = observe(s.engine);
    expect(s.perm("marcus").currentDP).not.toBe(6000);
    expect(view.hasKeyword(s.perm("marcus"), "Rush")).toBe(false);
    expect(view.isRestricted(s.perm("marcus"), "digivolve")).toBe(false);
    expect(view.hasKeyword(s.perm("agumon"), "Rush")).toBe(false);
    expect(view.isRestricted(s.perm("agumon"), "digivolve")).toBe(false);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toHaveLength(2);
    expect(snapshots).toHaveLength(2);
    const suspensionDraw = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "AD1-021" && event.timing === "whenSuspended",
    );
    const firstSecurity = s.events.findIndex((event) => event.kind === "securityRevealed");
    expect(suspensionDraw).toBeGreaterThanOrEqual(0);
    expect(firstSecurity).toBeGreaterThan(suspensionDraw);
    expect(snapshots.every((snapshot) => snapshot.dp === 6000 && snapshot.rush && snapshot.restricted)).toBe(true);
    expect(snapshots.every((snapshot) => snapshot.attackerId === marcusPermanentId)).toBe(true);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("does not offer the trailing attack without the yellow Agumon/Greymon gate", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "AD1-021", as: "marcus" }],
          hand: ["BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          security: ["BT1-009", "BT1-010"],
          hand: ["BT1-011"],
          deck: ["BT1-012", "BT1-013", "BT1-014", "BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );

    await advance(s.engine).runTurn(0);

    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("binds every Marcus grant to one selection and declares exactly one optional attack", () => {
    const endTurn = compiled?.effects.find((effect) => effect.trigger === "EndOfYourTurn");
    expect(endTurn).toBeDefined();
    expect(endTurn?.frequency).toBe("OncePerTurn");
    expect(endTurn?.actions).toHaveLength(6);
    expect(endTurn?.actions[0]).toMatchObject({
      kind: "SelectBind",
      target: {
        bindAs: "chosenMarcus",
        count: 1,
        filter: { controller: "mine", nameOrTrait: [{ tokens: ["Marcus Damon"], match: "name" }] },
      },
    });
    for (const action of endTurn?.actions.slice(1, 5) ?? []) {
      expect(action).toMatchObject({ target: { fromSelectionRef: "chosenMarcus", count: 1 } });
    }
    expect(endTurn?.actions.filter((action) => action.kind === "Attack")).toEqual([
      expect.objectContaining({ kind: "Attack", optional: true }),
    ]);
  });

  it("still draws on suspension but rejects a hand Digimon without Greymon in its name", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "AD1-021", as: "tamer" },
            { card: "BT12-042", as: "base" },
          ],
          hand: [{ card: "BT1-010", as: "notGreymon" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).verb.suspend([s.perm("tamer").permanentId]);
    await settle();
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("notGreymon").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.cardId === "BT1-009")).toBe(true);
    expect(s.perm("base").topCard.cardId).toBe("BT12-042");
  });
});

const MARCUS_AGUMON = "AD1-021";
const BECOME_DIGIMON_AGUMON = "BT13-008";
const GREYMON_INHERITS_2000 = "BT1-015";
const MATT_ISHIDA = "BT15-083";
const PAUSE_PLUG_IN = "P-095";
const CHAMPION_ULTIMATE_FIGHTER = "BT21-096";
const FILLER = "BT1-009";
const METALGARURUMON_INHERITS_MEMORY = "BT5-031";
const ZENIMON_TAMER_ONLY_MEMORY = "BT18-059";
const RIZEGREYMON = "BT21-044";
const MARCUS_DAMON = "BT13-095";
const YELLOW_AGUMON = "BT12-034";
const MUCHOMON = "BT1-013";
const fillerDeck = () => Array.from({ length: 8 }, () => FILLER);

type Setup = ReturnType<typeof setupEngine>;

async function activateBecomeDigimon(s: Setup, sourceAlias: string, marcusAlias: string): Promise<void> {
  const [effect] = observe(s.engine).activatableEffects(s.perm(sourceAlias));
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.perm(sourceAlias).topCard.instanceId,
      effectKey: effect!.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm(marcusAlias).currentDP > 0);
  await settle();
}

function attackPlayer(s: Setup, attackerAlias: string) {
  return s.engine.applyIntent(0, {
    type: "attack",
    attackerPermanentId: s.perm(attackerAlias).permanentId,
    target: { kind: "player" },
  });
}

describe("AD1-021 Marcus Damon & Agumon — KB Q&A rulings", () => {
  it("is not a Digimon despite [Agumon] in its name: it cannot attack or satisfy its own yellow Agumon gate (Q6101)", async () => {
    const definition = getCardDefinition(MARCUS_AGUMON)!;
    expect(definition.kinds).toEqual(["Tamer"]);
    expect(definition.colors).toContain("Yellow");
    expect(matchNameOrTrait(definition, { tokens: ["Agumon"], match: "name" })).toBe(true);

    const s = setupEngine(
      {
        0: { battleArea: [{ card: MARCUS_AGUMON, as: "marcus" }], hand: [FILLER], deck: fillerDeck() },
        1: { security: [FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(attackPlayer(s, "marcus").ok).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("once treated as a Digimon it attacks and gains inherited effects, but not on the turn it was played (Q6102)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus", under: [GREYMON_INHERITS_2000] },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("marcus").currentDP).toBe(0);
    expect(observe(s.engine).canUseInheritedEffect(s.perm("marcus"), GREYMON_INHERITS_2000)).toBe(false);
    expect(attackPlayer(s, "marcus").ok).toBe(false);

    await activateBecomeDigimon(s, "agumon", "marcus");
    const eventsBeforeAttack = s.events.length;

    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());
    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(
      s.events
        .slice(eventsBeforeAttack)
        .filter((event) => event.kind === "securityRevealed")
        .map((event) => event.attackerDP),
    ).toEqual([5000]);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    const fresh = setupEngine(
      {
        0: {
          battleArea: [{ card: BECOME_DIGIMON_AGUMON, as: "agumon" }],
          hand: [{ card: MARCUS_AGUMON, as: "marcus" }, FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    fresh.state.memory = 5;
    await fresh.ready();
    const freshTurn = fresh.engine.runOneTurn();
    await advance(fresh.engine).waitForMainPhase(0);
    expect(fresh.engine.applyIntent(0, { type: "playCard", instanceId: fresh.inst("marcus").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      fresh.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === MARCUS_AGUMON),
    );
    await activateBecomeDigimon(fresh, "agumon", "marcus");

    expect(fresh.perm("marcus").currentDP).toBe(3000);
    expect(attackPlayer(fresh, "marcus").ok).toBe(false);
    advance(fresh.engine).endMainPhaseIfOpen(0);
    await freshTurn;
  });

  it("is both a Digimon and a Tamer: it attacks and its suspension triggers a red/yellow Tamer inherited effect (Q6103)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
            { card: GREYMON_INHERITS_2000, as: "greymon", under: [BECOME_DIGIMON_AGUMON] },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: {
          battleArea: [
            { card: FILLER, as: "small", dp: 3000 },
            { card: FILLER, as: "large", dp: 4000 },
          ],
          security: [FILLER, FILLER],
          hand: [FILLER],
          deck: fillerDeck(),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const smallId = s.perm("small").topCard.instanceId;
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await activateBecomeDigimon(s, "agumon", "marcus");
    const handBefore = s.state.players[0]!.hand.length;

    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.trash.some((card) => card.instanceId === smallId));
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toContain(smallId);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
      s.perm("large").permanentId,
    );
    expect(s.state.players[0]!.hand.length).toBe(handBefore + 1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("an effect it activates while treated as a Digimon is also a Digimon effect: its Draw triggers Matt Ishida (Q6104)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
            { card: MATT_ISHIDA, as: "matt" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await activateBecomeDigimon(s, "agumon", "marcus");
    const handBefore = s.state.players[0]!.hand.length;
    const memoryBefore = s.state.memory;

    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.length === handBefore + 1);
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.state.players[0]!.hand.length).toBe(handBefore + 1);
    expect(s.perm("matt").isSuspended).toBe(true);
    expect(s.state.memory).toBe(memoryBefore + 1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("is deleted by the rule check when its Digimon DP becomes 0 (Q6105)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [PAUSE_PLUG_IN, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    const marcusInstanceId = s.perm("marcus").topCard.instanceId;
    preferInstanceIds.push(marcusInstanceId);
    await s.ready();
    expect(s.perm("marcus").currentDP).toBe(0);

    await advance(s.engine).runTurn(0);

    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(true);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === marcusInstanceId)).toBe(
      false,
    );
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(marcusInstanceId);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.permanentId)).toContain(
      s.perm("agumon").permanentId,
    );
  });

  it("a newer treated-as-Digimon effect overwrites the DP of an older one, even to a lower value, and adds <Rush> (Q6106)", async () => {
    const preferInstanceIds: string[] = [];
    const snapshots: Array<{ dp: number; rush: boolean; restricted: boolean }> = [];
    let engineRef: Setup["engine"] | undefined;
    let stateRef: Setup["state"] | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds,
        onEvent: (event) => {
          if (event.kind !== "attackDeclared" || engineRef === undefined || stateRef === undefined) return;
          const marcus = stateRef.players[0]!.battleArea.find(
            (permanent) => permanent.topCard?.cardId === MARCUS_AGUMON,
          );
          if (marcus === undefined) return;
          snapshots.push({
            dp: marcus.currentDP,
            rush: observe(engineRef).hasKeyword(marcus, "Rush"),
            restricted: observe(engineRef).isRestricted(marcus, "digivolve"),
          });
        },
      },
    );
    engineRef = s.engine;
    stateRef = s.state;
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    await s.ready();

    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await activateBecomeDigimon(s, "agumon", "marcus");
    expect(s.perm("marcus").currentDP).toBe(3000);
    expect(observe(s.engine).hasKeyword(s.perm("marcus"), "Rush")).toBe(false);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    expect(snapshots).toEqual([{ dp: 6000, rush: true, restricted: true }]);

    const reversed = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
          ],
          hand: [{ card: CHAMPION_ULTIMATE_FIGHTER, as: "fighter" }, FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    reversed.state.memory = 10;
    await reversed.ready();
    const reversedTurn = reversed.engine.runOneTurn();
    await advance(reversed.engine).waitForMainPhase(0);
    expect(
      reversed.engine.applyIntent(0, { type: "playCard", instanceId: reversed.inst("fighter").instanceId }),
    ).toEqual({ ok: true });
    await settle(() => reversed.perm("marcus").currentDP === 12000);
    await settle();
    expect(reversed.perm("marcus").currentDP).toBe(12000);

    await activateBecomeDigimon(reversed, "agumon", "marcus");
    expect(reversed.perm("marcus").currentDP).toBe(3000);
    advance(reversed.engine).endMainPhaseIfOpen(0);
    await reversedTurn;
  });
  it("gains memory from its own effect while treated as a Digimon despite a Tamer-effects-only memory lock (Q6107)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus", under: [METALGARURUMON_INHERITS_MEMORY] },
            { card: BECOME_DIGIMON_AGUMON, as: "agumon" },
            { card: MUCHOMON, as: "plainDigimon", under: [METALGARURUMON_INHERITS_MEMORY] },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: {
          battleArea: [{ card: ZENIMON_TAMER_ONLY_MEMORY, as: "zenimon" }],
          security: [FILLER, FILLER, FILLER],
          hand: [FILLER],
          deck: fillerDeck(),
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await activateBecomeDigimon(s, "agumon", "marcus");

    const memoryBeforePlainAttack = s.state.memory;
    expect(attackPlayer(s, "plainDigimon")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 2 && !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(memoryBeforePlainAttack);

    const memoryBeforeMarcusAttack = s.state.memory;
    expect(attackPlayer(s, "marcus")).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1 && !observe(s.engine).isAttacking());
    expect(s.state.memory).toBe(memoryBeforeMarcusAttack + 1);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;
  });

  it("a Tamer effect activated while it is treated as a Digimon is also a Digimon effect: an opponent's Digimon immune to Digimon effects isn't affected (Q6108)", async () => {
    async function opponentDigimonSurvives(immuneToDigimonEffects: boolean): Promise<boolean> {
      const preferInstanceIds: string[] = [];
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: MARCUS_AGUMON, as: "marcusAgumon" },
              { card: MARCUS_DAMON, as: "marcus" },
              { card: YELLOW_AGUMON, as: "agumon" },
            ],
            hand: [FILLER],
            deck: fillerDeck(),
          },
          1: {
            battleArea: [{ card: FILLER, as: "target", dp: 3000 }],
            security: [FILLER, FILLER, FILLER],
            hand: [FILLER],
            deck: fillerDeck(),
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
      );
      preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
      const marcusPermanentId = s.perm("marcus").permanentId;
      const targetInstanceId = s.perm("target").topCard.instanceId;
      await s.ready();
      const ownTurn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      if (immuneToDigimonEffects) {
        advance(s.engine).ledgers.continuous.addRestriction(
          s.perm("target").permanentId,
          "beAffected",
          EffectDuration.Permanent,
          { fromSourceKind: ["Digimon"], byOpponentEffectsOnly: true },
        );
      }
      advance(s.engine).endMainPhaseIfOpen(0);
      await ownTurn;

      const attackers = s.events.flatMap((event) =>
        event.kind === "attackDeclared" ? [event.attackerPermanentId] : [],
      );
      expect(attackers).toEqual([marcusPermanentId]);
      return s.state.players[1]!.battleArea.some((permanent) => permanent.topCard?.instanceId === targetInstanceId);
    }

    expect(await opponentDigimonSurvives(false)).toBe(false);
    expect(await opponentDigimonSurvives(true)).toBe(true);
  });

  it("attacks with its [End of Your Turn] effect after RizeGreymon's attack resolved in the turn that passed memory (Q6109)", async () => {
    const preferInstanceIds: string[] = [];
    let setup: Setup | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcusAgumon" },
            { card: MARCUS_DAMON, as: "marcus" },
          ],
          hand: [{ card: RIZEGREYMON, as: "rize" }, FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER, FILLER, FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds,
        onEvent: (event) => {
          if (event.kind === "attackDeclared" && setup !== undefined) {
            const marcusAgumon = setup.state.players[0]!.battleArea.find(
              (permanent) => permanent.topCard?.cardId === MARCUS_AGUMON,
            );
            preferInstanceIds.splice(0, preferInstanceIds.length, marcusAgumon?.topCard?.instanceId ?? "");
          }
          if (event.kind === "alliancePrompt") {
            queueMicrotask(() => setup?.engine.applyIntent(0, { type: "respondAlliance" }));
          }
        },
      },
    );
    setup = s;
    const marcusAgumonPermanentId = s.perm("marcusAgumon").permanentId;
    const marcusPermanentId = s.perm("marcus").permanentId;
    preferInstanceIds.push(s.perm("marcus").topCard.instanceId);
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rize").instanceId })).toEqual({ ok: true });
    await ownTurn;

    const attackers = s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
    expect(attackers).toEqual([marcusPermanentId, marcusAgumonPermanentId]);
    expect(s.state.players[1]!.security).toHaveLength(3);
  });

  it("the second copy's [End of Your Turn] effect can't declare an attack during the first copy's attack (Q6110)", async () => {
    const endOfTurnResolutions: Array<{ sourceInstanceId?: string; duringAttack: boolean }> = [];
    let setup: Setup | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "firstCopy" },
            { card: MARCUS_AGUMON, as: "secondCopy" },
            { card: YELLOW_AGUMON, as: "agumon" },
            { card: MUCHOMON, as: "muchomon" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER, FILLER, FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: (event) => {
          if (setup === undefined || event.kind !== "effectResolved" || event.effectKey !== "AD1-021/ir-3-0") return;
          endOfTurnResolutions.push({
            sourceInstanceId: event.sourceInstanceId,
            duringAttack: observe(setup.engine).isAttacking(),
          });
        },
      },
    );
    setup = s;
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    const attackers = s.events.flatMap((event) => (event.kind === "attackDeclared" ? [event.attackerPermanentId] : []));
    expect(new Set(endOfTurnResolutions.map((resolution) => resolution.sourceInstanceId))).toEqual(
      new Set([s.inst("firstCopy").instanceId, s.inst("secondCopy").instanceId]),
    );
    expect(endOfTurnResolutions.map((resolution) => resolution.duringAttack)).toEqual([true, false]);
    expect(attackers).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(4);
  });

  it("its [End of Your Turn] effect is mandatory with a yellow Agumon: Marcus still becomes a 6000 DP Rush Digimon when the attack is declined (Q6111)", async () => {
    const snapshots: Array<{ dp: number; rush: boolean }> = [];
    let setup: Setup | undefined;
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: MARCUS_AGUMON, as: "marcus" },
            { card: YELLOW_AGUMON, as: "agumon" },
          ],
          hand: [FILLER],
          deck: fillerDeck(),
        },
        1: { security: [FILLER, FILLER, FILLER], hand: [FILLER], deck: fillerDeck() },
      },
      {
        autoDeclineOptional: true,
        autoSelectCards: true,
        onEvent: () => {
          const marcus = setup?.state.players[0]!.battleArea.find(
            (permanent) => permanent.topCard?.cardId === MARCUS_AGUMON,
          );
          if (setup === undefined || marcus === undefined) return;
          snapshots.push({ dp: marcus.currentDP, rush: observe(setup.engine).hasKeyword(marcus, "Rush") });
        },
      },
    );
    setup = s;
    await s.ready();
    const ownTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const effectDecisionsBeforeEndOfTurn = s.decisions.length;
    advance(s.engine).endMainPhaseIfOpen(0);
    await ownTurn;

    expect(snapshots).toContainEqual({ dp: 6000, rush: true });
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(3);
    const optionalEndOfTurnPrompts = s.decisions
      .slice(effectDecisionsBeforeEndOfTurn)
      .filter((decision) => decision.req.kind === "optional")
      .map((decision) => decision.req.options?.effectTextPart);
    expect(optionalEndOfTurnPrompts).toEqual(["Then, 1 of your Digimon may attack."]);
  });
});
