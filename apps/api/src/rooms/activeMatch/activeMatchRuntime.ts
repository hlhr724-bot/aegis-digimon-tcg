import { LocalPresence } from "colyseus";
import type { ActiveMatchDirectory } from "#api/rooms/activeMatch/ActiveMatchDirectory";
import { createActiveMatchDirectory } from "#api/rooms/activeMatch/createActiveMatchDirectory";

export const activeMatchRuntime: { directory: ActiveMatchDirectory } = {
  directory: createActiveMatchDirectory({ presence: new LocalPresence() }),
};
