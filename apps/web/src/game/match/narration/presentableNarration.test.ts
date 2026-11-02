import { Side } from "../../side";
import { afterEach, describe, expect, it } from "vitest";
import { NOTICE_LIFETIME_MS, type MatchNotice } from "../../notices";
import type { NarrationItem } from "../../narration";
import { TOUCH_NARRATION_LIFETIME_SCALE } from "../../narration";
import { setNoticeDuration } from "../../noticeDuration";
import { SIDE_PANEL_LIFETIME_MS } from "@/game/sidePanels";
import { presentableNarration, createDiscardedSourcePanels } from "./presentableNarration";

const item = {
  id: "moment-1",
  side: 0,
  batchId: "batch-1",
  createdAt: 0,
  notice: { id: "notice-1" } as MatchNotice,
} as unknown as NarrationItem;

describe("presentable narration", () => {
  afterEach(() => setNoticeDuration("normal"));

  it("keeps the default reading time at normal duration on a wide layout", () => {
    expect(presentableNarration(item, { collapseNarration: false }).lifetimeMs).toBeUndefined();
  });

  it("stretches the reading time by the chosen notice duration", () => {
    setNoticeDuration("longest");
    expect(presentableNarration(item, { collapseNarration: false }).lifetimeMs).toBe(NOTICE_LIFETIME_MS * 2);
  });

  it("shortens the reading time of a notice and its card panel at short duration", () => {
    setNoticeDuration("short");
    const withPanel = {
      ...item,
      panel: { id: "panel-1", side: 0, titleKey: "panel.trashed", cards: [], ordered: false, createdAt: 0 },
    } as unknown as NarrationItem;
    expect(presentableNarration(item, { collapseNarration: false }).lifetimeMs).toBe(
      Math.round(NOTICE_LIFETIME_MS * 0.6),
    );
    expect(presentableNarration(withPanel, { collapseNarration: false }).lifetimeMs).toBe(
      Math.round(Math.max(NOTICE_LIFETIME_MS, SIDE_PANEL_LIFETIME_MS) * 0.6),
    );
  });

  it("combines the notice duration with the touch layout's longer clock", () => {
    setNoticeDuration("long");
    expect(presentableNarration(item, { collapseNarration: true }).lifetimeMs).toBe(
      Math.round(NOTICE_LIFETIME_MS * TOUCH_NARRATION_LIFETIME_SCALE * 1.5),
    );
  });
});

describe("discarded source panels across batches", () => {
  function moved(id: string, resolutionId = "effect-1"): NarrationItem {
    return {
      id,
      batchId: id,
      side: Side.Opponent,
      createdAt: 0,
      panel: {
        id,
        resolutionId,
        titleKey: "panel.trashedDigivolutionCards",
        side: Side.Opponent,
        cards: [{ cardId: "BT1-009", badge: 1 }],
        ordered: false,
        createdAt: 0,
      },
    };
  }
  it("retains identical physical cards from three hosts after earlier panels expire", () => {
    const group = createDiscardedSourcePanels();
    group(moved("batch-1"));
    expect(group(moved("batch-2")).panel?.cards).toHaveLength(2);
    expect(group(moved("batch-3")).panel?.cards.map((card) => card.badge)).toEqual([1, 2, 3]);
  });
  it("does not duplicate a republished occurrence or combine separate activations", () => {
    const group = createDiscardedSourcePanels();
    group(moved("batch-1"));
    expect(group(moved("batch-1")).panel?.cards).toHaveLength(1);
    expect(group(moved("batch-2", "effect-2")).panel?.cards).toHaveLength(1);
  });
});
