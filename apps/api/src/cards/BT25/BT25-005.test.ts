import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled as BT25_005 } from "./BT25-005.js";
import "../index.js";

async function answerUntilPagumonDecision(s: ReturnType<typeof setupEngine>, accept: boolean): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await settle(() => s.state.pendingDecision !== undefined);
    const decision = s.decisions.at(-1)!.req;
    const isPagumon = decision.sourceCardId === "BT25-005";
    expect(decision.kind).toBe(isPagumon ? "selectCards" : "optional");
    expect(decision.options).toMatchObject(isPagumon ? { min: 0, max: 1, purpose: "optionalTarget" } : {});
    const selectionKind = decision.kind === "chooseTargets" ? "chooseTargets" : "selectCards";
    const candidates = decision.options?.candidateInstanceIds ?? [];
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response:
          decision.kind === "optional"
            ? { kind: "optional", accept: false }
            : {
                kind: selectionKind,
                instanceIds: isPagumon && !accept ? [] : candidates.slice(0, decision.options?.max ?? 1),
              },
      }),
    ).toEqual({ ok: true });
    if (isPagumon) return;
  }
  throw new Error("Pagumon evolution choice did not appear");
}

async function declinePendingOptionals(s: ReturnType<typeof setupEngine>): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await settle(() => s.state.pendingDecision?.kind === "optional" || s.state.pendingDecision == null);
    const decision = s.state.pendingDecision;
    if (decision?.kind !== "optional") return;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
  }
}

describe("BT25-005 Pagumon", () => {
  it("matches the catalog identity and Three Musketeers trigger traits", () => {
    expect(getCardDefinition("BT25-005")).toMatchObject({
      cardId: "BT25-005",
      nameEn: "Pagumon",
      colors: ["Black"],
      kinds: ["DigiEgg"],
      level: 2,
      playCost: -1,
      forms: ["In-Training"],
      types: ["Lesser", "Iliad", "TS"],
    });
  });

  it("digivolves this Digimon when a Three Musketeers card is added underneath", () => {
    const effect = BT25_005.effects?.find((entry) => entry.isInherited);
    expect(effect).toMatchObject({ trigger: "YourTurn", frequency: "OncePerTurn" });
    const watcher = effect?.actions?.[0] as {
      event?: string;
      sourceFilter?: unknown;
      triggerFilter?: unknown;
      addedDigivolutionCardFilter?: unknown;
    };
    expect(watcher).toMatchObject({
      kind: "SubTrigger",
      event: "onAddDigivolutionCards",
      sourceFilter: { controllerDefault: "mine" },
      triggerFilter: { isSelfRef: true },
      addedDigivolutionCardFilter: {
        nameOrTrait: [{ tokens: ["Three Musketeers"], match: "trait" }],
      },
    });
    expect((watcher as { actions?: unknown[] }).actions?.[0]).toMatchObject({
      kind: "Digivolve",
      reduceCost: 2,
      payCost: true,
      from: ["hand"],
      optional: true,
      preserveOncePerTurnOnDecline: true,
    });
  });

  it("actually performs the extra discounted evolution after a Three Musketeers card is placed", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-085", as: "host", under: ["BT25-005", "BT10-058", "BT10-062", "BT10-064"] }],
          hand: [
            { card: "EX7-066", as: "neutralOption" },
            { card: "BT24-081", as: "extraTarget" },
          ],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferOptionIndex: 1,
        preferInstanceIds: preferred,
      },
    );
    preferred.push(s.inst("neutralOption").instanceId, s.inst("extraTarget").instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("neutralOption").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.instanceId === s.inst("extraTarget").instanceId);

    expect(s.perm("host").topCard?.cardId).toBe("BT24-081");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual([
      "EX7-066",
      "BT25-005",
      "BT10-058",
      "BT10-062",
      "BT10-064",
      "BT25-085",
    ]);
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("does not react when a Three Musketeers card is placed under another host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-085", as: "wrongHost" },
            { card: "BT25-085", as: "host", under: ["BT25-005", "BT10-058", "BT10-062", "BT10-064"] },
          ],
          hand: [
            { card: "EX7-066", as: "source" },
            { card: "BT24-081", as: "target" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: [] },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("wrongHost").stack.some((card) => card.instanceId === s.inst("source").instanceId));
    expect(s.perm("host").topCard?.cardId).toBe("BT25-085");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
  });

  it("uses the Q6252 text-only destination through a legal black Lv.5 host stack", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-013", as: "host", under: ["BT25-005", "BT10-058", "BT10-062"] }],
          hand: [
            { card: "BT25-085", as: "optionSource" },
            { card: "EX7-066", as: "placedSource" },
            { card: "BT7-015", as: "textOnlyTarget" },
          ],
        },
        1: { battleArea: [{ card: "BT1-013", as: "opponent" }] },
      },
      { autoSelectCards: true, declinePrompts: ["Arts Digivolve"], preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("placedSource").instanceId,
      s.inst("textOnlyTarget").instanceId,
      s.inst("optionSource").instanceId,
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("optionSource").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    for (let i = 0; i < 12; i += 1) {
      await settle(() => s.state.pendingDecision?.kind === "optional" || s.state.pendingDecision == null);
      const decision = s.state.pendingDecision;
      if (decision?.kind !== "optional") break;
      const accept = decision.promptText === "Place 1 card(s) under" || decision.promptText === "Digivolve";
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
    }
    await settle(() => s.perm("host").topCard?.instanceId === s.inst("textOnlyTarget").instanceId);
    expect(s.perm("host").topCard?.cardId).toBe("BT7-015");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual([
      "EX7-066",
      "BT25-005",
      "BT10-058",
      "BT10-062",
      "BT10-013",
    ]);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.hand).toHaveLength(0);
  });

  it("does not trigger when ordinary evolution places a non-Three Musketeers card under the host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-062", as: "host", under: ["BT25-005", "BT10-058"] }],
          hand: [
            { card: "BT10-064", as: "evolution" },
            { card: "BT7-015", as: "target" },
          ],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true },
    );
    s.state.memory = 6;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard?.instanceId === s.inst("evolution").instanceId);
    expect(s.perm("host").topCard?.cardId).toBe("BT10-064");
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT25-005", "BT10-058", "BT10-062"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT7-015");
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("does not offer the inherited evolution when Bagramon places a Three Musketeers card during the opponent turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "BT25-085",
              as: "host",
              under: ["BT25-005", "BT10-058", "BT10-062", "BT10-064"],
            },
            { card: "BT25-085", as: "placedSource" },
          ],
          hand: [{ card: "BT24-081", as: "target" }],
        },
        1: {
          battleArea: [{ card: "BT10-064", as: "bagramonBase" }],
          hand: [{ card: "BT11-088", as: "bagramon" }],
        },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("placedSource").instanceId);
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("bagramonBase").permanentId,
        instanceId: s.inst("bagramon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").stack.some((card) => card.instanceId === s.inst("placedSource").instanceId));

    expect(s.perm("host").topCard.cardId).toBe("BT25-085");
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("target").instanceId);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("preserves the once-per-turn opportunity after declining, then accepts after a second real placement", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-085", as: "host", under: ["BT25-005", "BT10-058", "BT10-062", "BT10-064"] }],
          hand: [
            { card: "EX7-066", as: "firstSource" },
            { card: "EX7-066", as: "secondSource" },
            { card: "EX7-073", as: "target" },
          ],
        },
        1: { battleArea: [{ card: "BT1-013", as: "opponent" }] },
      },
      { autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(s.inst("firstSource").instanceId, s.inst("secondSource").instanceId, s.inst("target").instanceId);
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("firstSource").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await answerUntilPagumonDecision(s, false);
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX7-066", "EX7-073"]);
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("secondSource").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await answerUntilPagumonDecision(s, true);
    await settle(() => s.perm("host").topCard?.instanceId === s.inst("target").instanceId);
    expect(s.state.memory).toBe(-2);
  });

  it("does not offer Pagumon's once-per-turn evolution after it already accepts one", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-085", as: "host", under: ["BT25-005", "BT10-058", "BT10-062", "BT10-064"] }],
          hand: [
            { card: "EX7-066", as: "firstSource" },
            { card: "EX7-066", as: "secondSource" },
            { card: "EX7-073", as: "firstTarget" },
            { card: "BT24-081", as: "laterTarget" },
          ],
        },
        1: { battleArea: [{ card: "BT1-013", as: "opponent" }] },
      },
      { autoChooseOption: true, preferInstanceIds: preferred },
    );
    preferred.push(
      s.inst("firstSource").instanceId,
      s.inst("secondSource").instanceId,
      s.inst("firstTarget").instanceId,
      s.inst("laterTarget").instanceId,
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("firstSource").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await answerUntilPagumonDecision(s, true);
    await settle(() => s.perm("host").topCard?.instanceId === s.inst("firstTarget").instanceId);
    await declinePendingOptionals(s);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("secondSource").instanceId);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("laterTarget").instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("secondSource").instanceId,
        useAs: "option",
      } as never),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s
          .perm("host")
          .stack.map((card) => card.cardId)
          .filter((id) => id === "EX7-066").length === 2,
    );
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("laterTarget").instanceId);
    expect(s.perm("host").topCard?.instanceId).toBe(s.inst("firstTarget").instanceId);
  });
});
