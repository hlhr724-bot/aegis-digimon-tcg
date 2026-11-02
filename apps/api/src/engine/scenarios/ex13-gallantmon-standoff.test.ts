import fixtureEx13GallantmonStandoff from "./ex13-gallantmon-standoff.fixture.js";
import { fixtureInstanceId, fixturePermanentId } from "../scenario/references.js";
import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { layScenarioFixture } from "../scenario/fixture.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";
import { advance } from "../testkit/advance.js";
import { setupEngine, settle } from "../testkit/harness.js";

describe("EX13 Gallantmon standoff dev scenario", () => {
  it.each([true, false])("resolves nested protection with accept=%s", async (accept) => {
    const s = setupEngine(
      { 0: {}, 1: {} },
      {
        autoChooseOption: true,
        autoSelectCards: true,
      },
    );
    layScenarioFixture(s.state, fixtureEx13GallantmonStandoff, [BLUE_DECK, RED_DECK], true);
    const loop = s.engine.startTurnLoop();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const securityBefore = s.state.players[1]!.security.length;
    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: fixtureInstanceId("ex13-gallantmon-standoff-hand-card"),
        assembly: {
          materialInstanceIds: [
            fixtureInstanceId("ex13-standoff-lv5-card"),
            fixtureInstanceId("ex13-standoff-lv4-card"),
            fixtureInstanceId("ex13-standoff-lv3-card"),
          ],
        },
      } as never),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.seat === 1);
    const onPlayIndex = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.timing === "OnPlay" && event.sourceCardId === "EX13-015",
    );
    const targetIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectTargetsSelected" &&
        event.seat === 0 &&
        event.targetPermanentIds.includes(fixturePermanentId("opponent-ex13-standoff-gallantmon")),
    );
    const findProtectionIndex = () =>
      s.events.findIndex(
        (event) => event.kind === "effectTriggered" && event.timing === "AllTurns" && event.seat === 1,
      );
    const listAnnouncements = () =>
      s.events
        .filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-015")
        .map((event) => (event.kind === "effectTriggered" ? [event.seat, event.timing] : []));
    expect(targetIndex).toBeGreaterThan(onPlayIndex);
    expect(findProtectionIndex()).toBe(-1);
    expect(listAnnouncements()).toEqual([[0, "OnPlay"]]);
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional" && s.state.pendingDecision.seat === 0);
    expect(findProtectionIndex()).toBeGreaterThan(targetIndex);
    expect(listAnnouncements()).toEqual([
      [0, "OnPlay"],
      [1, "AllTurns"],
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some(
          (event) => event.kind === "effectResolved" && event.sourceCardId === "EX13-015" && event.timing === "OnPlay",
        ) && s.state.pendingDecision === undefined,
    );
    const opponentBoard = s.state.players[1]!.battleArea.map((permanent) => permanent.topCard?.cardId);
    const survivors = s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.cardId);
    const securityAfter = s.state.players[1]!.security.length;
    const protections = s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "EX13-015");
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
    expect(survivors).toEqual(accept ? ["EX13-015"] : []);
    expect(opponentBoard).toEqual(accept ? [] : ["EX13-015", "EX13-007"]);
    expect(protections.map(({ req }) => req.seat)).toEqual([1, 0]);
    expect(securityAfter).toBe(securityBefore - (accept ? 0 : 1));
  });
});
