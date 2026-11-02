import type { ActiveMatch } from "@aegis/shared/protocol/ActiveMatch";

type Params = {
  http: string;
  fetcher: typeof fetch;
};

export async function requestActiveMatch({ http, fetcher }: Params): Promise<ActiveMatch | undefined> {
  const response = await fetcher(`${http}/match/active`, { credentials: "include", cache: "no-store" });
  if (!response.ok) {
    return undefined;
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { roomId, seat, reconnectGraceMs } = body as Partial<ActiveMatch>;
  if (typeof roomId !== "string" || !roomId || (seat !== 0 && seat !== 1)) {
    return undefined;
  }
  if (typeof reconnectGraceMs !== "number" || !Number.isFinite(reconnectGraceMs) || reconnectGraceMs < 0) {
    return { roomId, seat };
  }
  return { roomId, seat, reconnectGraceMs };
}
