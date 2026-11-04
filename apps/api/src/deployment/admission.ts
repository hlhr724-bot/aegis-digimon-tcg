import { readFileSync } from "node:fs";

let acceptsRoomCreation = () => true;
let drainStartedAt: number | undefined;

/** Both HTTP matchmaking and internal tournament room creation use this gate. */
export function setRoomCreationAdmission(check: () => boolean): void {
  acceptsRoomCreation = check;
  drainStartedAt = undefined;
}

export function canCreateRoom(): boolean {
  const accepting = acceptsRoomCreation();
  drainStartedAt = accepting ? undefined : (drainStartedAt ?? Date.now());
  return accepting;
}

export function deploymentDrainStartedAt(): number | undefined {
  canCreateRoom();
  return drainStartedAt;
}

/** Directory-mounted manifest survives atomic replacement and process restarts. */
export function isActiveDeploymentSlot(path: string, slot: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { active?: { slot?: string } };
    return manifest.active?.slot === slot;
  } catch {
    return false;
  }
}
