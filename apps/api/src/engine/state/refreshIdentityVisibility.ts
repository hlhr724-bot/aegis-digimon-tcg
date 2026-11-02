import type { StateView } from "@colyseus/schema";
import type { GameState } from "@aegis/shared/schema/GameState";
import type { Seat } from "@aegis/shared/schema/enums";
import { PLAYER_IDENTITY_VIEW_TAG } from "@aegis/shared/schema/viewTags";

type Params = { view: StateView; state: GameState; seat: Seat | undefined };

export function refreshIdentityVisibility({ view, state, seat }: Params): void {
  for (const player of state.players) {
    if (seat === undefined && player.hideIdentityFromSpectators && view.hasTag(player, PLAYER_IDENTITY_VIEW_TAG)) {
      view.remove(player, PLAYER_IDENTITY_VIEW_TAG);
    }
    if ((seat !== undefined || !player.hideIdentityFromSpectators) && !view.hasTag(player, PLAYER_IDENTITY_VIEW_TAG)) {
      view.add(player, PLAYER_IDENTITY_VIEW_TAG);
    }
  }
}
