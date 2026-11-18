import { SERIES_NEXT_GAME_JOIN_SECONDS } from "@aegis/shared/matchFormat";

const NEXT_GAME_POLL_MS = 2000;
const NEXT_GAME_START_MARGIN_MS = 30_000;

type Params<Room> = {
  spectate: () => Promise<Room>;
  isCancelled: () => boolean;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
};

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function spectateNextSeriesGame<Room>({
  spectate,
  isCancelled,
  now = Date.now,
  wait = waitFor,
}: Params<Room>): Promise<Room> {
  const deadline = now() + SERIES_NEXT_GAME_JOIN_SECONDS * 1000 + NEXT_GAME_START_MARGIN_MS;
  for (;;) {
    try {
      return await spectate();
    } catch (error) {
      if (now() >= deadline || isCancelled()) {
        throw error;
      }
    }
    await wait(NEXT_GAME_POLL_MS);
  }
}
