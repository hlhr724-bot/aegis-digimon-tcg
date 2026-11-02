// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { CardInstance, Permanent } from "@aegis/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setCardSleeveId } from "@/design/sleeve";
import { I18nProvider } from "@/i18n/I18nProvider";
import { CardArt } from "@/game/overlay/CardArt";
import { PermanentView } from "@/game/piece/PermanentView";

const SELECTED_SLEEVE = 'img[src="/sleeves/omnimon.webp"]';
const DEFAULT_SLEEVE = 'img[src="/sleeves/digimon-standard.webp"]';

beforeEach(() => {
  localStorage.clear();
  setCardSleeveId("omnimon");
});

afterEach(() => cleanup());

function faceDownPermanent(): Permanent {
  const permanent = new Permanent();
  permanent.permanentId = "face-down-permanent";
  permanent.controllerSeat = 1;
  permanent.topCard = Object.assign(new CardInstance(), { instanceId: "face-down-top", faceUp: false, ownerSeat: 1 });
  permanent.linked.push(
    Object.assign(new CardInstance(), { instanceId: "face-down-link", faceUp: false, ownerSeat: 1 }),
  );
  return permanent;
}

describe("face-down card backs", () => {
  it("draws the opponent's face-down field cards without the local sleeve", () => {
    const { container } = render(
      <I18nProvider>
        <PermanentView perm={faceDownPermanent()} useSelectedSleeve={false} />
      </I18nProvider>,
    );
    expect(container.querySelector(SELECTED_SLEEVE)).toBeNull();
    expect(container.querySelectorAll(DEFAULT_SLEEVE)).toHaveLength(2);
  });

  it("keeps the local sleeve on the viewer's own face-down field cards", () => {
    const { container } = render(
      <I18nProvider>
        <PermanentView perm={faceDownPermanent()} />
      </I18nProvider>,
    );
    expect(container.querySelectorAll(SELECTED_SLEEVE)).toHaveLength(2);
  });

  it("draws an unreadable card in a viewer without the local sleeve", () => {
    const { container } = render(<CardArt cardId="" width={42} />);
    expect(container.querySelector(SELECTED_SLEEVE)).toBeNull();
    expect(container.querySelector(DEFAULT_SLEEVE)).toBeTruthy();
  });
});
