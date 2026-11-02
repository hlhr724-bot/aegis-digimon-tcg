import { useEffect, useRef, useState } from "react";
import { appendOpenedPacks } from "@/packOpening/appendOpenedPacks";
import { BOOSTER_BOX_PACK_COUNT, type BoosterBox, type BoosterProgress } from "@/packOpening/BoosterProgress";
import type { BoxHit } from "@/packOpening/BoxHit";
import type { PackCard } from "@/packOpening/PackCard";
import { startBoosterBox } from "@/packOpening/startBoosterBox";
import { readBoosterProgress } from "@/packOpening/readBoosterProgress";
import { saveBoosterProgress } from "@/packOpening/saveBoosterProgress";

type PlanParams = {
  setId: string;
  createHits: () => BoxHit[];
};

type RecordParams = {
  setId: string;
  packs: readonly (readonly PackCard[])[];
};

export function useBoosterProgress() {
  const [progress, setProgress] = useState(readBoosterProgress);
  const current = useRef(progress);
  const [saveFailed, setSaveFailed] = useState(false);

  function updateProgress(next: BoosterProgress) {
    current.current = next;
    setProgress(next);
    setSaveFailed(!saveBoosterProgress(next));
  }

  function recordPacks({ setId, packs }: RecordParams): boolean {
    const next = appendOpenedPacks({ progress: current.current, setId, packs, openedAt: Date.now() });
    if (next === current.current) {
      return false;
    }
    updateProgress(next);
    return true;
  }

  function ensurePlannedBox({ setId, createHits }: PlanParams): BoosterBox {
    const active = current.current.activeBox;
    const box = active?.setId === setId ? active : { setId, packs: [] };
    if (box.hits) {
      return box;
    }
    const planned = { ...box, hits: createHits() };
    updateProgress({ version: 2, activeBox: planned });
    return planned;
  }

  useEffect(() => {
    setSaveFailed(!saveBoosterProgress(current.current));
  }, []);

  function startBox(setId: string) {
    updateProgress(startBoosterBox(setId));
  }

  function startNextBox(setId: string) {
    const entry = current.current.activeBox;
    if (!entry || entry.setId !== setId || entry.packs.length !== BOOSTER_BOX_PACK_COUNT) {
      return;
    }
    startBox(setId);
  }

  return { progress, saveFailed, recordPacks, ensurePlannedBox, startBox, startNextBox };
}
