import { Zone } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { createCardSource } from "../cards/CardSource.js";
import {
  createCardStateLookup,
  createEffectContext,
  createGameAccess,
  unimplementedDecisions,
  unimplementedPrimitives,
} from "./context.js";
import { candidatePermanents } from "./interpreter/targeting/permanents.js";
import {
  extractCardById,
  extractLinkedById,
  linkCard,
  popFromStack,
  pushOnStack,
  setTopCard,
} from "../state/access.js";
import { setupEngine } from "../testkit/harness.js";

function selfTargetIds(ctx: Parameters<typeof candidatePermanents>[0]): string[] {
  return candidatePermanents(ctx, { filter: { isSelfRef: true }, count: 1, isSelf: true }).map(
    (permanent) => permanent.permanentId,
  );
}

function sourceContext(s: ReturnType<typeof setupEngine>, alias: string) {
  return createEffectContext({
    source: createCardSource(s.inst(alias), createCardStateLookup(s.state)),
    trigger: {},
    game: createGameAccess(s.state),
    fx: unimplementedPrimitives(),
    ask: unimplementedDecisions(),
  });
}

describe("self-target permanent identity", () => {
  it("does not follow a top source card into a different host", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT21-019", as: "source", under: ["BT21-010"] },
          { card: "BT1-010", as: "newHost" },
        ],
      },
    });
    await s.ready();
    const original = s.perm("source");
    const destination = s.perm("newHost");
    const ctx = sourceContext(s, "source");
    const sourceCard = original.topCard!;
    setTopCard(original, popFromStack(original)!);
    pushOnStack(destination, sourceCard);

    expect(ctx.source.permanent()?.permanentId).toBe(destination.permanentId);
    expect(selfTargetIds(ctx)).toEqual([original.permanentId]);
  });

  it("keeps a self target on the same host when its top card evolves", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-019", as: "source", under: ["BT21-010"] }],
        hand: [{ card: "BT21-022", as: "newTop" }],
      },
    });
    await s.ready();
    const host = s.perm("source");
    const ctx = sourceContext(s, "source");
    const oldTop = host.topCard!;
    const newTop = s.inst("newTop");
    extractCardById(s.state.players[0]!, Zone.Hand, newTop.instanceId);
    pushOnStack(host, oldTop);
    setTopCard(host, newTop);

    expect(ctx.source.permanent()?.permanentId).toBe(host.permanentId);
    expect(host.topCard.instanceId).toBe(newTop.instanceId);
    expect(selfTargetIds(ctx)).toEqual([host.permanentId]);
  });

  it.each([
    { label: "inherited", placement: "stack", sourceCard: "BT21-019" },
    { label: "linked", placement: "linked", sourceCard: "BT21-047" },
  ] as const)("does not follow an $label source into a different host", async ({ placement, sourceCard }) => {
    const s = setupEngine({
      0: {
        battleArea: [
          {
            card: placement === "stack" ? "BT21-022" : "BT21-018",
            as: "original",
            ...(placement === "stack"
              ? { under: [{ card: sourceCard, as: "source" }] }
              : { linked: [{ card: sourceCard, as: "source" }] }),
          },
          { card: placement === "stack" ? "BT21-022" : "BT21-018", as: "newHost" },
        ],
      },
    });
    await s.ready();
    const original = s.perm("original");
    const destination = s.perm("newHost");
    const ctx = sourceContext(s, "source");
    const sourceInstance =
      placement === "stack"
        ? popFromStack(original)!
        : extractLinkedById(original, original.linked.at(-1)!.instanceId)!;
    if (placement === "stack") pushOnStack(destination, sourceInstance);
    else linkCard(destination, sourceInstance, "bottom");

    expect(ctx.source.permanent()?.permanentId).toBe(destination.permanentId);
    expect(selfTargetIds(ctx)).toEqual([original.permanentId]);
  });

  it("uses the captured host when the source leaves it but the original host remains", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT21-019", as: "source", under: ["BT21-010"] }],
      },
    });
    await s.ready();
    const original = s.perm("source");
    const ctx = sourceContext(s, "source");
    const sourceCard = original.topCard!;
    setTopCard(original, popFromStack(original)!);
    s.state.players[0]!.trash.push(sourceCard);

    expect(ctx.source.permanent()).toBeUndefined();
    expect(selfTargetIds(ctx)).toEqual([original.permanentId]);
  });
});
