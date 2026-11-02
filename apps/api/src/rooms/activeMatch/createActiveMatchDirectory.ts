import type { Presence } from "colyseus";
import type { ActiveMatchDirectory } from "#api/rooms/activeMatch/ActiveMatchDirectory";

type Params = {
  presence: Presence;
  keyPrefix?: string;
};

const ENTRY_TTL_SECONDS = 10 * 60;

export function createActiveMatchDirectory({ presence, keyPrefix = "" }: Params): ActiveMatchDirectory {
  const getKey = (accountId: string) => `${keyPrefix}active-match:${accountId}`;
  return {
    publish: async ({ accountId, roomId }) => {
      await presence.setex(getKey(accountId), roomId, ENTRY_TTL_SECONDS);
    },
    find: async (accountId) => {
      const roomId: unknown = await presence.get(getKey(accountId));
      return typeof roomId === "string" && roomId ? roomId : undefined;
    },
    release: async ({ accountId, roomId }) => {
      if ((await presence.get(getKey(accountId))) === roomId) {
        await presence.del(getKey(accountId));
      }
    },
  };
}
