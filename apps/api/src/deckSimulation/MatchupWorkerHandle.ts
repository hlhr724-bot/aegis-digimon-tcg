import type { MatchupWorkerMessage, MatchupWorkerRequest } from "#api/deckSimulation/MatchupWorkerMessage";

export type MatchupWorkerHandle = {
  postMessage: (request: MatchupWorkerRequest) => void;
  onMessage: (listener: (message: MatchupWorkerMessage) => void) => void;
  onExit: (listener: () => void) => void;
  terminate: () => void;
};
