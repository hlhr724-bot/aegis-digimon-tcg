import type { Color, ShaderMaterial } from "three";
import type { ArenaRimEntry } from "@/game/arena3d/meshes/ArenaRim";

type Params = {
  material: ShaderMaterial;
  rim: ArenaRimEntry | undefined;
  auraColor: Color;
  aura: number;
  time: number;
  flowing: boolean;
};

export function applyArenaCardGlow({ material, rim, auraColor, aura, time, flowing }: Params): void {
  const uniforms = material.uniforms;
  uniforms.uTime!.value = time;
  uniforms.uFlow!.value = flowing ? 1 : 0;
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
