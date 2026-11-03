export const Arena3dFallbackReason = {
  WEBGL_UNAVAILABLE: { name: "WEBGL_UNAVAILABLE", value: "webglUnavailable" },
  CONTEXT_LOST: { name: "CONTEXT_LOST", value: "contextLost" },
  RESTART_FAILED: { name: "RESTART_FAILED", value: "restartFailed" },
  SCENE_CRASHED: { name: "SCENE_CRASHED", value: "sceneCrashed" },
} as const;

export type Arena3dFallbackReason = (typeof Arena3dFallbackReason)[keyof typeof Arena3dFallbackReason]["value"];
