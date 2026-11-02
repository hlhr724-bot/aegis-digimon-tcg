// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { setupEngine } from "@aegis-api/engine/testkit/harness.js";
import { observe } from "@aegis-api/engine/testkit/observe.js";
import "@aegis-api/cards/BT6/BT6-087.js";
import { cleanup, fireEvent, render, screen, within } from "./scenarioHarness/testingLibrary";
import { tap } from "./scenarioHarness/tap";
import { GameScreen } from "../src/game/GameScreen";

const mocked = vi.hoisted(() => ({
  roomResult: { current: undefined as unknown },
  room: { roomId: "bond-warp-ui-room", onMessage: () => () => {}, send: () => {} },
  activateEffect: vi.fn<(room: unknown, sourceInstanceId: string, effectKey: string) => void>(),
  respondDecision: vi.fn<(room: unknown, decisionId: string, response: unknown) => void>(),
}));

vi.mock("../src/net/useRoom", () => ({
  useRoom: () => mocked.roomResult.current,
}));

vi.mock("../src/net/intents", () => ({
  intents: {
    activateEffect: mocked.activateEffect,
    respondDecision: mocked.respondDecision,
  },
}));

afterEach(() => {
  cleanup();
  mocked.activateEffect.mockReset();
  mocked.respondDecision.mockReset();
});

function bondState() {
  const s = setupEngine({
    0: {
      battleArea: [
        { card: "BT1-010", as: "agumon" },
        { card: "BT6-087", as: "tai" },
      ],
      hand: [{ card: "BT6-018", as: "bond" }],
      security: 5,
    },
    1: { security: 5 },
  });
  s.state.players[0]!.sessionId = "viewer-session";
  s.state.players[1]!.sessionId = "opponent-session";
  observe(s.engine).activatableEffects(s.perm("tai"));
  return s;
}

async function renderBondState({ decision }: { decision?: (s: ReturnType<typeof bondState>) => unknown } = {}) {
  const s = bondState();
  mocked.roomResult.current = {
    room: mocked.room,
    status: "connected",
    state: s.state,
    events: [],
    decision: decision?.(s),
    error: undefined,
    sessionId: "viewer-session",
    stateVersion: 1,
    roomCode: "",
  };

  render(
    <GameScreen
      joinOptions={{ displayName: "Protagonist", deck: { mainDeck: [], eggDeck: [] } }}
      identityColor="Red"
      startMode="casual"
      onExit={() => {}}
    />,
  );
  return s;
}

it("exposes Tai's Bond warp as an activatable Main action", async () => {
  const s = await renderBondState();

  // Tapping the permanent opens its action menu; the activation is an entry there,
  // named after the effect it activates — the convention cardActionSheet.test.tsx
  // pins: "Activate effect: <description>".
  tap(screen.getByRole("button", { name: /^tai kamiya/i }));
  fireEvent.click(screen.getByRole("button", { name: /^activate effect: .*digivolve/i }));

  expect(mocked.activateEffect).toHaveBeenCalledWith(
    mocked.room,
    s.perm("tai").topCard.instanceId,
    "BT6-087/main-digivolve-bond-of-bravery",
  );
});

it("renders the Agumon permanent candidate and submits the warp target", async () => {
  const decisionId = "bond-warp-target";
  const s = await renderBondState({
    decision: (state) => ({
      decisionId,
      seat: 0,
      kind: "chooseTargets",
      promptText: "Tai Kamiya",
      sourceCardId: "BT6-087",
      options: {
        candidateInstanceIds: [state.perm("agumon").permanentId],
        min: 1,
        max: 1,
      },
    }),
  });
  const actualAgumonPermanentId = s.perm("agumon").permanentId;
  const prompt = screen.getByRole("region", { name: "Confirm targets" });
  expect(prompt.getAttribute("data-prompt-surface")).toBe("left");
  const agumon = within(screen.getByRole("group", { name: "Your battle area" })).getByRole("button", {
    name: /^agumon, \(BT1-010\), Field reference #/i,
  });
  expect(agumon.classList.contains("game-permanent--candidate")).toBe(true);
  expect(agumon.getAttribute("data-permanent-id")).toBe(actualAgumonPermanentId);
  tap(agumon);
  fireEvent.click(within(prompt).getByRole("button", { name: /confirm targets/i }));

  expect(mocked.respondDecision).toHaveBeenCalledWith(mocked.room, decisionId, {
    kind: "chooseTargets",
    instanceIds: [actualAgumonPermanentId],
  });
});
