export const Arena3dSceneStatus = {
  RUNNING: { name: "RUNNING", value: "running" },
  RESTARTING: { name: "RESTARTING", value: "restarting" },
  STOPPED: { name: "STOPPED", value: "stopped" },
} as const;

export type Arena3dSceneStatus = (typeof Arena3dSceneStatus)[keyof typeof Arena3dSceneStatus]["value"];
