import { expect, it } from "vitest";
import { Zone } from "@aegis/shared/schema/enums";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { beginResolvingWindow, endResolvingWindow } from "#api/engine/gameEngine/windows";
import { pendingEffectCandidates } from "#api/engine/gameEngine/pendingEffectCandidates";
import { extractCardById, insertCard } from "#api/engine/state/access";
import "#api/cards/BT3/BT3-047";
import "#api/cards/BT3/BT3-006";
import "#api/cards/BT11/BT11-071";
import "#api/cards/BT11/BT11-079";

it.each(["pending", "left", "returned"] as const)(
  "identifies the deferred deletion occurrence while its source is %s",
  async (mode) => {
    const s = setupEngine({
      1: {
        battleArea: [{ card: "BT3-047", as: "source" }],
        trash: [{ card: "BT3-047", as: "old" }],
      },
    });
    await s.ready();
    const id = s.perm("source").topCard.instanceId;
    const old = s.inst("old").instanceId;
    const spec = {
      seat: 0 as const,
      kind: "selectCards" as const,
      promptText: "Choose",
      options: { candidateInstanceIds: [old, id] },
    };
    const outer = beginResolvingWindow(s.engine);
    s.engine.effectResolutionDepth += 1;
    try {
      await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
      expect(pendingEffectCandidates(s.engine, spec)).toEqual([id]);
      if (mode !== "pending") {
        const card = extractCardById(s.state.players[1]!, Zone.Trash, id)!;
        insertCard(s.state.players[1]!, mode === "returned" ? Zone.Trash : Zone.Hand, card);
      }
      expect(pendingEffectCandidates(s.engine, spec)).toEqual(mode === "pending" ? [id] : []);
      expect(
        pendingEffectCandidates(s.engine, { ...spec, options: { ...spec.options, visibleInstanceIds: [] } }),
      ).toEqual([]);
      if (mode === "pending") {
        const window = s.engine.deferredTimingWindows[0]!;
        const entry = window.readPendingEffects!()[0]!;
        s.engine.pendingNestedTimingEffects.push({ ...entry, effect: { ...entry.effect, canActivate: () => false } });
        window.readPendingEffects = () => [];
      }
      expect(pendingEffectCandidates(s.engine, spec)).toEqual([]);
    } finally {
      s.engine.effectResolutionDepth -= 1;
      s.engine.deferredTimingWindows.splice(0);
      endResolvingWindow(s.engine, outer);
    }
    expect(pendingEffectCandidates(s.engine, spec)).toEqual([]);
  },
);

it("does not mark a deletion without a triggered effect", async () => {
  const s = setupEngine({ 1: { battleArea: [{ card: "BT1-009", as: "source" }] } });
  await s.ready();
  const id = s.perm("source").topCard.instanceId;
  const outer = beginResolvingWindow(s.engine);
  s.engine.effectResolutionDepth += 1;
  try {
    await advance(s.engine).verb.deletePermanent([s.perm("source").permanentId]);
    expect(
      pendingEffectCandidates(s.engine, {
        seat: 0,
        kind: "selectCards",
        promptText: "Choose",
        options: { candidateInstanceIds: [id] },
      }),
    ).toEqual([]);
  } finally {
    s.engine.effectResolutionDepth -= 1;
    s.engine.deferredTimingWindows.splice(0);
    endResolvingWindow(s.engine, outer);
  }
});

it.each([true, false])("checks inherited deletion visibility and host arrival (faceUp=%s)", async (faceUp) => {
  const s = setupEngine({
    1: { battleArea: [{ card: "BT1-009", as: "host", under: [{ card: "BT3-006", as: "source" }] }] },
  });
  await s.ready();
  s.inst("source").faceUp = faceUp;
  const sourceId = s.inst("source").instanceId;
  const hostId = s.perm("host").topCard.instanceId;
  const spec = {
    seat: 0 as const,
    kind: "selectCards" as const,
    promptText: "Choose",
    options: { candidateInstanceIds: [sourceId] },
  };
  const outer = beginResolvingWindow(s.engine);
  s.engine.effectResolutionDepth += 1;
  try {
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    expect(pendingEffectCandidates(s.engine, spec)).toEqual(faceUp ? [sourceId] : []);
    const host = extractCardById(s.state.players[1]!, Zone.Trash, hostId)!;
    insertCard(s.state.players[1]!, Zone.Trash, host);
    expect(pendingEffectCandidates(s.engine, spec)).toEqual([]);
  } finally {
    s.engine.effectResolutionDepth -= 1;
    s.engine.deferredTimingWindows.splice(0);
    endResolvingWindow(s.engine, outer);
  }
});

it("marks another pending deletion source while the first deletion effect chooses cards", async () => {
  const s = setupEngine({
    0: {
      battleArea: [
        { card: "BT11-071", as: "chooser" },
        { card: "BT11-079", as: "pending" },
      ],
      trash: [{ card: "BT11-079", as: "old" }],
      deck: ["BT1-009", "BT1-009"],
    },
  });
  await s.ready();
  const pendingId = s.perm("pending").topCard.instanceId;
  const chooserId = s.perm("chooser").topCard.instanceId;
  const deletion = advance(s.engine).verb.deletePermanent([
    s.perm("chooser").permanentId,
    s.perm("pending").permanentId,
  ]);
  try {
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const request = s.decisions.at(-1)!.req;
    expect(request.sourceCardId).toBe("BT11-071");
    expect(request.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([chooserId, pendingId, s.inst("old").instanceId]),
    );
    expect(request.options?.pendingEffectInstanceIds).toEqual([pendingId]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: request.decisionId,
        response: { kind: "selectCards", instanceIds: [pendingId] },
      }),
    ).toEqual({ ok: true });
    await deletion;
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.engine.pendingEffectReaders.size).toBe(0);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === pendingId)).toBe(true);
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT11-079")).toBe(false);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await deletion;
  }
});
