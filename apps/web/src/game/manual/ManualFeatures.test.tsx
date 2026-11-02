import { ManualQuickActions } from "@/game/manual/ManualQuickActions";
import { Zone } from "@aegis/shared/schema/enums";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { CardInstance } from "@aegis/shared/schema/CardInstance";
import { PlayerState } from "@aegis/shared/schema/PlayerState";
import { ManualRevealGallery } from "@/game/manual/ManualRevealGallery";
import { ManualPermanentControls } from "@/game/manual/ManualPermanentControls";
import { ManualTableTools } from "@/game/manual/ManualTableTools";
import { tokenDefinitions } from "@aegis/shared/cards/tokens";
import type { ManualCommand } from "@aegis/shared/manual/ManualCommand";

vi.mock("@/i18n/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/design/cards", () => ({ CardMini: ({ cardId }: { cardId: string }) => <span>{cardId}</span> }));

describe("manual card tools", () => {
  it("shows public reveals with their owners without exposing instance identifiers", () => {
    const state = new GameState();
    const owner = new PlayerState();
    owner.displayName = "Reveal owner";
    state.players = new ArraySchema(owner);
    state.manual.revealedJson = JSON.stringify([{ cardId: "BT1-001", seat: 0, instanceId: "private-reference" }]);
    const markup = renderToStaticMarkup(<ManualRevealGallery state={state} />);
    expect(markup).toContain("BT1-001");
    expect(markup).toContain("Reveal owner");
    expect(markup).not.toContain("private-reference");
  });

  it("prevents removing tokens with attached cards and retains the marker editor", () => {
    const permanent = new Permanent();
    permanent.permanentId = "token";
    const card = new CardInstance();
    card.cardId = tokenDefinitions[0]!.cardId;
    permanent.topCard = card;
    permanent.stack.push(new CardInstance());
    const markup = renderToStaticMarkup(
      <ManualPermanentControls
        permanent={permanent}
        opponent={new PlayerState()}
        send={vi.fn<(command: ManualCommand) => void>()}
      />,
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>manual.features.removeToken<\/button>/);
    expect(markup).toContain("datalist");
    expect(markup).toContain("manual.features.applyModifiers");
  });

  it("disables reveals for an empty pile and allows clearing only the owner's gallery", () => {
    const state = new GameState();
    state.players = new ArraySchema(new PlayerState(), new PlayerState());
    state.manual.revealedJson = JSON.stringify([{ cardId: "BT1-001", seat: 1 }]);
    const markup = renderToStaticMarkup(
      <ManualTableTools state={state} seat={0} send={vi.fn<(command: ManualCommand) => void>()} />,
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>manual.features.revealCards<\/button>/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>manual.features.clearReveals<\/button>/);
  });
});

it("disables another attack during combat while leaving manual suspension available", () => {
  const permanent = new Permanent();
  permanent.permanentId = "attacker";
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010" });
  const markup = renderToStaticMarkup(
    <ManualPermanentControls
      combatActive
      permanent={permanent}
      opponent={new PlayerState()}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>manual.attack<\/button>/);
  expect(markup).toMatch(/<button type="button">manual.suspend<\/button>/);
});

it("keeps multiple visual statuses selected and disables training when the deck is empty", () => {
  const permanent = new Permanent();
  permanent.permanentId = "marked";
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010" });
  permanent.manualStatuses.push("sick", "immune");
  const markup = renderToStaticMarkup(
    <ManualPermanentControls
      deckCount={0}
      permanent={permanent}
      opponent={new PlayerState()}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toMatch(/aria-pressed="true"[^>]*>manual.features.status.sick<\/button>/);
  expect(markup).toMatch(/aria-pressed="true"[^>]*>manual.features.status.immune<\/button>/);
  expect(markup).toMatch(/aria-pressed="false"[^>]*>manual.features.status.taunt<\/button>/);
  expect(markup).toMatch(/disabled=""[^>]*>manual.features.training<\/button>/);
  expect(markup).toContain("manual.features.resetModifiers");
});

it("offers contextual card moves without an unnecessary move back to the same hand", () => {
  const markup = renderToStaticMarkup(
    <ManualQuickActions
      source={{ key: "hand-card", label: "Hand card", from: { zone: Zone.Hand, instanceId: "hand-card" } }}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toContain("manual.features.play");
  expect(markup).toContain("manual.features.toTrash");
  expect(markup).toContain("manual.features.deckTop");
  expect(markup).not.toContain("manual.features.toHand");
});

it("requires turning a face-down attacker up before declaring an attack", () => {
  const permanent = new Permanent();
  permanent.permanentId = "face-down-attacker";
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010", faceUp: false });
  const markup = renderToStaticMarkup(
    <ManualPermanentControls
      permanent={permanent}
      opponent={new PlayerState()}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toMatch(/disabled=""[^>]*>manual.attack<\/button>/);
});

it("does not offer declaring an attack from the breeding area", () => {
  const permanent = new Permanent();
  permanent.permanentId = "breeding";
  permanent.inBreeding = true;
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010" });
  const markup = renderToStaticMarkup(
    <ManualPermanentControls
      permanent={permanent}
      opponent={new PlayerState()}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toMatch(/disabled=""[^>]*>manual.attack<\/button>/);
});

it("keeps attack declarations disabled until the manual breeding choice is complete", () => {
  const permanent = new Permanent();
  permanent.permanentId = "waiting-for-breeding";
  permanent.topCard = Object.assign(new CardInstance(), { cardId: "BT1-010" });
  const markup = renderToStaticMarkup(
    <ManualPermanentControls
      canDeclareAttack={false}
      permanent={permanent}
      opponent={new PlayerState()}
      send={vi.fn<(command: ManualCommand) => void>()}
    />,
  );
  expect(markup).toMatch(/disabled=""[^>]*>manual.attack<\/button>/);
  expect(markup).toMatch(/<button type="button">manual.suspend<\/button>/);
});
