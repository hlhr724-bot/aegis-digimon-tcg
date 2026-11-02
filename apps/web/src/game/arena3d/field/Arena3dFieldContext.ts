import { createContext } from "react";
import type { PerspectiveCamera } from "three";
import type { ArenaCameraFrame } from "@/game/arena3d/field/ArenaCameraFrame";
import type { ArenaFieldStore } from "@/game/arena3d/field/createArenaFieldStore";

export type Arena3dFieldContextValue = {
  frame: ArenaCameraFrame;
  camera: PerspectiveCamera;
  store: ArenaFieldStore;
};

export const Arena3dFieldContext = createContext<Arena3dFieldContextValue | undefined>(undefined);
