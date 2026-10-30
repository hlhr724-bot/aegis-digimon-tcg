import type { ArenaRippleBuffer } from "@/game/arena3d/createArenaRippleBuffer";

type Params = {
  buffer: ArenaRippleBuffer;
  x: number;
  z: number;
  startedAt: number;
  strength: number;
  color: string;
};

export function pushArenaRipple({ buffer, x, z, startedAt, strength, color }: Params): void {
  const slot = buffer.next % buffer.ripples.length;
  buffer.ripples[slot]!.set(x, z, startedAt, strength);
  buffer.colors[slot]!.set(color);
  buffer.next = slot + 1;
}
