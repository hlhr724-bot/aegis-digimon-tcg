import { renderToStaticMarkup } from "react-dom/server";
import { ArraySchema } from "@colyseus/schema";
import { describe, expect, it, vi } from "vitest";
import { GameState } from "@aegis/shared/schema/GameState";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { ManualRevealGallery } from "@/game/manual/ManualRevealGallery";

vi.mock("@/i18n/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/design/cards", () => ({ CardMini: () => <span>Card art</span> }));

describe("manual revealed card actions", () => {
  it("lets the owner move known revealed cards without inspecting the hidden pile", () => {
    const state = new GameState();
    state.players = new ArraySchema(new PlayerState(), new PlayerState());
    state.manual.revealedJson = JSON.stringify([
      { cardId: "BT1-010", seat: 0, instanceId: "first", zone: "deck" },
      { cardId: "BT1-027", seat: 1, instanceId: "second", zone: "security" },
    ]);
    const own = renderToStaticMarkup(<ManualRevealGallery state={state} seat={0} send={vi.fn()} />);
    expect(own.match(/<fieldset/g)).toHaveLength(1);
    expect(own).toContain("manual.features.moveRevealed");
    expect(own).not.toContain('disabled=""');
    expect(own).not.toContain('value="first"');
    const spectator = renderToStaticMarkup(<ManualRevealGallery state={state} />);
    expect(spectator).not.toContain("<fieldset");
  });

  it("keeps legacy and field reveals readable without offering invalid moves", () => {
    const state = new GameState();
    state.manual.revealedJson = JSON.stringify([
      { cardId: "BT1-010", seat: 0, instanceId: "legacy" },
      { cardId: "BT1-027", seat: 0, instanceId: "field", zone: "battleArea" },
    ]);
    const markup = renderToStaticMarkup(<ManualRevealGallery state={state} seat={0} send={vi.fn()} />);
    expect(markup).not.toContain("<fieldset");
    expect(markup).toContain("Card art");
  });

  it("disables moves while another table agreement is pending", () => {
    const state = new GameState();
    state.manual.revealedJson = JSON.stringify([{ cardId: "BT1-010", seat: 0, instanceId: "first", zone: "deck" }]);
    const markup = renderToStaticMarkup(<ManualRevealGallery state={state} seat={0} send={vi.fn()} disabled />);
    expect(markup).toMatch(/<fieldset[^>]*disabled=""/);
  });
});
