import type { Color, ShaderMaterial } from "three";
import type { ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";

type Params = {
  material: ShaderMaterial;
  rim: ArenaRimEntry | undefined;
  auraColor: Color;
  aura: number;
  time: number;
};

export function applyArenaCardGlow({ material, rim, auraColor, aura, time }: Params): void {
  const uniforms = material.uniforms;
  uniforms.uTime!.value = time;
  if (rim) {
    uniforms.uColor!.value.set(rim.color);
    uniforms.uStrength!.value = rim.strength;
    uniforms.uOutline!.value = 1;
    return;
  }
  uniforms.uColor!.value.copy(auraColor);
  uniforms.uStrength!.value = aura;
  uniforms.uOutline!.value = 0;
}
