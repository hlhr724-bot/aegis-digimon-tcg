import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { EffectSourceMark } from "@/game/effectMarks/EffectSourceMark";
import { TrashViewerOverlay } from "@/game/overlay/viewer/TrashViewerOverlay";

afterEach(cleanup);

function renderTrash(sheet: boolean) {
  render(
    <I18nProvider>
      <TrashViewerOverlay
        title="Trash"
        cardIds={["BT1-009", "BT1-009", "BT1-010"]}
        instanceIds={["first-copy", "second-copy", "other"]}
        effectSourceMarks={new Map([["second-copy", EffectSourceMark.RESOLVING.value]])}
        sheet={sheet}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
}

it("labels the exact trash copy whose effect is resolving", () => {
  renderTrash(false);

  const marked = screen.getAllByRole("button", { name: /Effect resolving/ });
  expect(marked).toHaveLength(1);
  expect(marked[0]!.textContent).toContain("copy 2 of 2");
  expect(document.querySelectorAll(".trash-viewer__label[data-effect-mark]")).toHaveLength(1);
});

it("labels the marked trash copy in the touch sheet", () => {
  renderTrash(true);

  const labels = document.querySelectorAll(".trash-viewer__label[data-effect-mark]");
  expect(labels).toHaveLength(1);
  expect(labels[0]!.closest("button")!.textContent).toContain("copy 2 of 2");
});
