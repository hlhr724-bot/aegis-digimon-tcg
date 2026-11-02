import type { ActiveMatchClaim } from "@aegis/shared/protocol/ActiveMatchClaim";

type Params = {
  http: string;
  fetcher: typeof fetch;
  roomId: string;
};

export async function requestActiveMatchClaim({
  http,
  fetcher,
  roomId,
}: Params): Promise<ActiveMatchClaim | undefined> {
  const response = await fetcher(`${http}/match/active/claim`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId }),
  });
  if (!response.ok) {
    return undefined;
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const claim = body as Partial<ActiveMatchClaim>;
  if (
    claim.roomId !== roomId ||
    (claim.seat !== 0 && claim.seat !== 1) ||
    typeof claim.reconnectionToken !== "string" ||
    !claim.reconnectionToken.startsWith(`${roomId}:`)
  ) {
    return undefined;
  }
  return { roomId, seat: claim.seat, reconnectionToken: claim.reconnectionToken };
}
