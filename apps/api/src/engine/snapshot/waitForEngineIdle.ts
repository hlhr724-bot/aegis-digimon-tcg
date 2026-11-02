type Params = { progress: () => number };

const MAX_IDLE_TURNS = 1_000;

export async function waitForEngineIdle({ progress }: Params): Promise<void> {
  let last = progress();
  for (let turn = 0; turn < MAX_IDLE_TURNS; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const now = progress();
    if (now === last && turn > 0) {
      return;
    }
    last = now;
  }
  throw new Error("Snapshot continuation engine did not go idle");
}
