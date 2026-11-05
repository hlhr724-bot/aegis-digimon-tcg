export const ARENA_3D_LIVE_ATTRIBUTE = "data-arena-3d-live";

export function isInsideLiveArena3d(element: Element): boolean {
  return element.closest(`.game-board[${ARENA_3D_LIVE_ATTRIBUTE}]`) != null;
}
