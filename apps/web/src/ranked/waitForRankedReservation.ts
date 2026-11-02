import type { RankedQueueView } from "@aegis/shared/ranked/RankedContracts";
import { RankedQueueStatus } from "@aegis/shared/ranked/RankedQueueStatus";
import type { AegisJoinOptions } from "@/net/types";
import { getRankedRegion } from "@/ranked/getRankedRegion";

type Params = {
  http: string;
  options: AegisJoinOptions;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  searchId?: string;
  resume?: boolean;
};

export async function waitForRankedReservation({
  http,
  options,
  signal,
  fetcher = fetch,
  searchId = crypto.randomUUID(),
  resume = false,
}: Params): Promise<RankedQueueView> {
  const endpoint = `${http}/ranked/queue?search=${searchId}`;
  let joined = false;
  async function request(method: string) {
    const response = await fetcher(endpoint, {
      method,
      credentials: "include",
      signal,
      headers: { "Content-Type": "application/json" },
      body:
        method === "POST"
          ? JSON.stringify({
              deckId: options.deckId,
              format: options.format ?? "standard",
              region: options.rankedRegion ?? getRankedRegion(),
            })
          : undefined,
    });
    const body = (await response.json()) as RankedQueueView & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "ranked_queue_failed");
    }
    return body;
  }
  try {
    let view = await request(resume ? "GET" : "POST");
    joined = true;
    for (;;) {
      signal?.throwIfAborted();
      if (view.status === RankedQueueStatus.RESERVED.value && view.roomId && view.token) {
        return { ...view, searchId };
      }
      if (view.status !== RankedQueueStatus.WAITING.value) {
        throw new Error("ranked_queue_expired");
      }
      await new Promise<void>((resolve, reject) => {
        function cancel() {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        }, 2000);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) {
          cancel();
        }
      });
      view = await request("GET");
    }
  } catch (error) {
    if (joined || signal?.aborted) {
      await fetcher(endpoint, { method: "DELETE", credentials: "include", keepalive: true }).catch(() => undefined);
    }
    throw error;
  }
}
