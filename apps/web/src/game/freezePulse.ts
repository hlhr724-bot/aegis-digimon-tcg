export type FreezeKind = "cannotAttack" | "cannotBlock" | "debuff" | "buff";

export interface FreezeFlags {
  cannotAttack: boolean;
  cannotBlock: boolean;
  debuffs: number;
  buffs: number;
}

export interface FreezePulse {
  permanentId: string;
  kind: FreezeKind;
  key: number;
}

export function freezePulses({
  previous,
  next,
  nextKey,
}: {
  previous: ReadonlyMap<string, FreezeFlags>;
  next: ReadonlyMap<string, FreezeFlags>;
  nextKey: number;
}): FreezePulse[] {
  const pulses: FreezePulse[] = [];
  let key = nextKey;
  for (const [permanentId, flags] of next) {
    const before = previous.get(permanentId);
    if (before === undefined) {
      continue;
    }
    const kind = freezeKind(before, flags);
    if (kind === undefined) {
      continue;
    }
    key += 1;
    pulses.push({ permanentId, kind, key });
  }
  return pulses;
}

export function freezeKind(before: FreezeFlags, after: FreezeFlags): FreezeKind | undefined {
  if (!before.cannotAttack && after.cannotAttack) {
    return "cannotAttack";
  }
  if (!before.cannotBlock && after.cannotBlock) {
    return "cannotBlock";
  }
  if (after.debuffs > before.debuffs) {
    return "debuff";
  }
  if (after.buffs > before.buffs) {
    return "buff";
  }
  return undefined;
}
