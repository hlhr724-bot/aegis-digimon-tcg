import { CylinderGeometry, PlaneGeometry, TetrahedronGeometry, TorusGeometry } from "three";

export const ARENA_PULSE_PLANE_GEOMETRY = new PlaneGeometry(1, 1);
export const ARENA_PULSE_PILLAR_GEOMETRY = new CylinderGeometry(0.5, 0.65, 1, 16, 1, true);
export const ARENA_PULSE_HELIX_GEOMETRY = new TorusGeometry(0.8, 0.025, 6, 32);
export const ARENA_PULSE_SHARD_GEOMETRY = new TetrahedronGeometry(0.16, 0);
