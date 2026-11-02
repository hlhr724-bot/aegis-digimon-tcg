import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { NarrationStack } from "@/game/NarrationStack";
import type { NarrationItem } from "@/game/narration";
import { NoticeSize } from "@/game/noticeSize/NoticeSize";
import { noticeSizePreference } from "@/game/noticeSize/noticeSizePreference";
import { ArenaBoardSettings } from "@/game/screen/layout/ArenaBoardSettings";
import { Side } from "@/game/side";

beforeEach(() => {
  localStorage.clear();
  noticeSizePreference.set(NoticeSize.NORMAL.value);
});

afterEach(cleanup);

const moment: NarrationItem = {
  id: "moment",
  side: Side.Opponent,
  batchId: "batch",
  createdAt: 0,
  notice: {
    id: "moment",
    side: Side.Opponent,
    fromSecurity: false,
    createdAt: 0,
    body: { variant: "effect", cardId: "BT1-010", timing: "OnPlay", description: "Gain 1 memory." },
  },
  panel: {
    id: "moment",
    titleKey: "panel.revealedCards",
    side: Side.Opponent,
    cards: [{ cardId: "BT1-010", badge: 1 }],
    ordered: false,
    createdAt: 0,
  },
};

function renderBoard() {
  return render(
    <I18nProvider>
      <ArenaBoardSettings />
      <NarrationStack
        narration={new Map([[moment.id, moment]])}
        nowMs={0}
        rejection={null}
        onAdvance={() => undefined}
        onDismissRejection={() => undefined}
      />
    </I18nProvider>,
  );
}

function getCardWidths(container: HTMLElement, selector: string) {
  return [...container.querySelectorAll<HTMLElement>(`${selector} [style*="width"]`)]
    .map((element) => element.style.width)
    .filter((width) => width.endsWith("px"));
}

it("draws notices and card panels at full size by default", () => {
  const { container } = renderBoard();
  const slots = [...container.querySelectorAll<HTMLElement>(".narration-slot")];
  expect(slots.length).toBeGreaterThan(0);
  for (const slot of slots) {
    expect(slot.dataset.noticeSize).toBe("normal");
    expect(slot.style.getPropertyValue("--notice-scale")).toBe("1");
  }
  expect(getCardWidths(container, ".side-panel__art")[0]).toBe("128px");
});

it("shrinks every notice column, its art and its card panels after choosing compact", () => {
  const { container } = renderBoard();
  fireEvent.change(screen.getByRole("combobox", { name: "Notice size" }), { target: { value: "compact" } });
  expect(localStorage.getItem("aegis.notice.size")).toBe("compact");
  for (const slot of container.querySelectorAll<HTMLElement>(".narration-slot")) {
    expect(slot.dataset.noticeSize).toBe("compact");
    expect(slot.style.getPropertyValue("--notice-scale")).toBe(String(NoticeSize.COMPACT.scale));
    expect(slot.style.getPropertyValue("--notice-text-scale")).toBe(String(NoticeSize.COMPACT.textScale));
  }
  expect(getCardWidths(container, ".side-panel__art")[0]).toBe(`${Math.round(128 * NoticeSize.COMPACT.scale)}px`);
  expect(getCardWidths(container, ".match-notice__thumb")[0]).toBe(`${Math.round(46 * NoticeSize.COMPACT.scale)}px`);
});
