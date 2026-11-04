import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, expect, it } from "vitest";
import type { AuthSession } from "#api/accounts/AccountStore";
import { RED_DECK } from "#api/engine/testDecks";
import { installDeckSimulationRoutes } from "#api/deckSimulation/installDeckSimulationRoutes";
import { MatchupSimulator } from "#api/deckSimulation/MatchupSimulator";
import type { MatchupWorkerHandle } from "#api/deckSimulation/MatchupWorkerHandle";

const session = { account: { id: "account-1" } } as AuthSession;
const idleWorker: MatchupWorkerHandle = {
  postMessage: () => undefined,
  onMessage: () => undefined,
  onExit: () => undefined,
  terminate: () => undefined,
};
const closers: (() => Promise<void>)[] = [];

async function startProcess(owner: string): Promise<string> {
  const app = express();
  app.use(express.json());
  installDeckSimulationRoutes({
    app,
    simulator: new MatchupSimulator({ spawnWorker: () => idleWorker, isHostBusy: () => false }),
    communityDecks: { matchupOpponents: async () => [] },
    results: { latest: async () => undefined },
    owner,
    session: async () => session,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  closers.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

it("names the API process that holds the job, because the other processes do not know it", async () => {
  const first = await startProcess("api/red/p1");
  const second = await startProcess("api/red/p2");
  const started = await fetch(`${first}/account/deck-simulations/matchups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deck: RED_DECK, opponent: { mirror: true }, games: 10 }),
  });
  expect(started.status).toBe(202);
  const job = (await started.json()) as { id: string; owner: string };
  expect(job.owner).toBe("api/red/p1");

  expect((await fetch(`${second}/account/deck-simulations/matchups/${job.id}`)).status).toBe(404);
  const polled = await fetch(`${first}/account/deck-simulations/matchups/${job.id}`);
  expect(polled.status).toBe(200);
  expect(((await polled.json()) as { owner: string }).owner).toBe("api/red/p1");
});
