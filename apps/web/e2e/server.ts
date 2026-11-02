import { createServer } from "node:http";
import { Server, createEndpoint, createRouter } from "colyseus";
import { createGameTransport } from "../../api/dist/connections/createGameTransport.js";
import { ROOM_TYPE, ROOM_TYPE_BOT } from "@aegis/shared";
import { AegisRoom, roomRegistry } from "../../api/dist/rooms/AegisRoom.js";
import "../../api/dist/cards/index.js";
import { BotPlayer } from "../../api/dist/bot/BotPlayer.js";
import type { DecisionRequest, GameState, Intent } from "@aegis/shared";
import { Edge } from "./edge";
import { configureLocalScenario, clearLocalScenario } from "../../api/dist/engine/scenario/local.js";
import type { ScenarioFixture } from "../../api/src/engine/scenario/types.js";

let activeFixtureServer: ((fixture: ScenarioFixture) => ReturnType<typeof configureLocalScenario>) | undefined;

export function useBrowserFixture(fixture: ScenarioFixture) {
  if (!activeFixtureServer) throw new Error("Start the browser server before opening a fixture");
  return activeFixtureServer(fixture);
}

const EDGE_PORT = Number(process.env.AEGIS_E2E_EDGE_PORT ?? 2569);
const SERVER_PORT = Number(process.env.AEGIS_E2E_SERVER_PORT ?? 2570);

export async function startBrowserServer({
  holdBotAllTurns = true,
  edgePort = EDGE_PORT,
  serverPort = SERVER_PORT,
  botOptionalScript,
  botMainIntents,
  holdBotAfterTurn = Infinity,
}: {
  holdBotAllTurns?: boolean;
  edgePort?: number;
  serverPort?: number;
  botOptionalScript?: { sourceCardId: string; answers: boolean[] };
  /** Deterministic opponent actions; the ordinary bot scheduler still enforces engine readiness. */
  botMainIntents?: Intent[];
  holdBotAfterTurn?: number;
} = {}) {
  const fixtureBotTurnWindow = holdBotAfterTurn;
  const scriptedAnswers = [...(botOptionalScript?.answers ?? [])];
  const scriptedMainIntents = botMainIntents === undefined ? undefined : [...botMainIntents];
  const scriptedBots = new WeakSet<object>();
  const queued: { bot: BotPlayer; request: DecisionRequest }[] = [];
  const originalDecision = BotPlayer.prototype.onDecisionRequested;
  const phases = BotPlayer.prototype as unknown as { onOwnPhase(phase: string, turn: number): void };
  const originalPhase = phases.onOwnPhase;
  const autonomous = BotPlayer.prototype as unknown as {
    state: GameState;
    runBreedingPhase(): Promise<void>;
    startMainPhaseLoop(): void;
  };
  const originalBreeding = autonomous.runBreedingPhase;
  const originalMain = autonomous.startMainPhaseLoop;
  autonomous.runBreedingPhase = function () {
    return this.state.turnCount < holdBotAfterTurn ? originalBreeding.call(this) : Promise.resolve();
  };
  autonomous.startMainPhaseLoop = function () {
    if (scriptedMainIntents !== undefined && !scriptedBots.has(this)) {
      scriptedBots.add(this);
      const bot = this as unknown as { policy: { chooseMainAction(): Intent } };
      bot.policy.chooseMainAction = () => scriptedMainIntents.shift() ?? { type: "endPhase" };
    }
    if (this.state.turnCount < holdBotAfterTurn) originalMain.call(this);
  };
  // Pause only autonomous opponent turns after the tested turn transfer; reactive
  // answers and all public engine intents still run normally.
  phases.onOwnPhase = function (phase, turn) {
    if (turn < holdBotAfterTurn) originalPhase.call(this, phase, turn);
  };
  const http = createServer();
  const server = new Server({ transport: createGameTransport({ server: http }) });
  // Colyseus 404s unknown routes itself, so a second request listener would double-respond.
  server.router = createRouter({
    botJoin: createEndpoint("/bot/join", { method: "POST" }, async (context) => {
      const { roomId } = context.body as { roomId: string };
      return new Response("{}", { status: roomRegistry.get(roomId)?.addBot() ? 200 : 400 });
    }),
  });
  server.define(ROOM_TYPE, AegisRoom, { botRoom: false });
  server.define(ROOM_TYPE_BOT, AegisRoom, { botRoom: true });
  await server.listen(serverPort, "127.0.0.1");
  const edge = new Edge(edgePort, serverPort);
  await edge.start();
  // Test pacing only: hold each reactive answer until the browser has inspected the scene.
  BotPlayer.prototype.onDecisionRequested = function (request) {
    // Script only the opponent's legal yes/no choices; game rules and the human UI stay real.
    if (
      request.kind === "optional" &&
      request.sourceCardId === botOptionalScript?.sourceCardId &&
      scriptedAnswers.length
    ) {
      const accept = scriptedAnswers.shift()!;
      setTimeout(
        () =>
          (this as unknown as { act(intent: Intent): void }).act({
            type: "respondDecision",
            decisionId: request.decisionId,
            response: { kind: "optional", accept },
          }),
        0,
      );
    } else if (holdBotAllTurns && request.options?.timing === "AllTurns") queued.push({ bot: this, request });
    else originalDecision.call(this, request);
  };

  const useFixture = (fixture: ScenarioFixture) => {
    const references = configureLocalScenario(fixture);
    holdBotAfterTurn = fixture.presentation?.holdBotAfterTurn ?? fixture.turnCount + fixtureBotTurnWindow;
    return references;
  };
  activeFixtureServer = useFixture;
  return {
    edge,
    useFixture,
    /** Bypasses the edge, so it survives `edge.stop()`. */
    directEndpoint: `ws://127.0.0.1:${serverPort}`,
    pendingBotDecision: () => queued[0]?.request,
    releaseBotDecision: () => {
      const next = queued.shift();
      if (!next) throw new Error("No held bot decision");
      originalDecision.call(next.bot, next.request);
    },
    close: async () => {
      activeFixtureServer = undefined;
      clearLocalScenario();
      BotPlayer.prototype.onDecisionRequested = originalDecision;
      phases.onOwnPhase = originalPhase;
      autonomous.runBreedingPhase = originalBreeding;
      autonomous.startMainPhaseLoop = originalMain;
      await edge.stop();
      await server.gracefullyShutdown(false);
    },
  };
}
