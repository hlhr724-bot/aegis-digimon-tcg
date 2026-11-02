import {
  BOOSTER_PROGRESS_KEY,
  LEGACY_BOOSTER_PROGRESS_KEY,
  BOOSTER_BOX_PACK_COUNT,
  type BoosterProgress,
  type BoosterBox,
  type OpenedPack,
} from "@/packOpening/BoosterProgress";
import { isBoxHit } from "@/packOpening/isBoxHit";

function isSetId(value: unknown): value is string {
  return typeof value === "string" && /^(?:BT|EX|RB|AD)\d+$/.test(value);
}

function isOpenedPack(value: unknown): value is OpenedPack {
  if (!value || typeof value !== "object") {
    return false;
  }
  const pack = value as Partial<OpenedPack>;
  return (
    Number.isFinite(pack.openedAt) &&
    Array.isArray(pack.cards) &&
    pack.cards.length === 12 &&
    pack.cards.every((card: unknown) => {
      if (!card || typeof card !== "object") {
        return false;
      }
      const entry = card as { cardId?: unknown; artId?: unknown };
      return typeof entry.cardId === "string" && (entry.artId === undefined || typeof entry.artId === "string");
    })
  );
}

function isBoosterBox(value: unknown): value is BoosterBox {
  if (!value || typeof value !== "object") {
    return false;
  }
  const box = value as Partial<BoosterBox>;
  return (
    isSetId(box.setId) &&
    Array.isArray(box.packs) &&
    box.packs.length <= BOOSTER_BOX_PACK_COUNT &&
    box.packs.every(isOpenedPack) &&
    (box.hits === undefined ||
      (Array.isArray(box.hits) && box.hits.length === BOOSTER_BOX_PACK_COUNT && box.hits.every(isBoxHit)))
  );
}

function readLegacyBox(value: unknown): BoosterBox | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const legacy = value as { version?: unknown; sets?: unknown };
  if (legacy.version !== 1 || !legacy.sets || typeof legacy.sets !== "object") {
    return null;
  }
  let latest: BoosterBox | null = null;
  let latestOpenedAt = -1;
  for (const [setId, raw] of Object.entries(legacy.sets)) {
    if (!isSetId(setId) || !raw || typeof raw !== "object") {
      continue;
    }
    const entry = raw as { boxesStarted?: unknown; packs?: unknown };
    if (
      typeof entry.boxesStarted !== "number" ||
      !Number.isSafeInteger(entry.boxesStarted) ||
      entry.boxesStarted < 1 ||
      !Array.isArray(entry.packs) ||
      entry.packs.length > entry.boxesStarted * BOOSTER_BOX_PACK_COUNT
    ) {
      continue;
    }
    const packs = entry.packs.slice((entry.boxesStarted - 1) * BOOSTER_BOX_PACK_COUNT);
    if (!packs.every(isOpenedPack)) {
      continue;
    }
    const openedAt = entry.packs.reduce(
      (latestTime: number, pack: unknown) => (isOpenedPack(pack) ? Math.max(latestTime, pack.openedAt) : latestTime),
      0,
    );
    if (openedAt >= latestOpenedAt) {
      latest = { setId, packs };
      latestOpenedAt = openedAt;
    }
  }
  return latest;
}

export function readBoosterProgress(): BoosterProgress {
  const empty: BoosterProgress = { version: 2, activeBox: null };
  try {
    const saved = localStorage.getItem(BOOSTER_PROGRESS_KEY);
    if (saved !== null) {
      const stored = JSON.parse(saved) as Partial<BoosterProgress> | null;
      if (stored?.version === 2 && (stored.activeBox === null || isBoosterBox(stored.activeBox))) {
        return { version: 2, activeBox: stored.activeBox };
      }
      return empty;
    }
    return {
      version: 2,
      activeBox: readLegacyBox(JSON.parse(localStorage.getItem(LEGACY_BOOSTER_PROGRESS_KEY) ?? "null")),
    };
  } catch {
    return empty;
  }
}
