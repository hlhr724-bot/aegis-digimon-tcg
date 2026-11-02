/**
 * View tag shared by owner-private schema fields.
 *
 * @colyseus/schema 5 matches view tags bitwise (`fieldTag & grantedTag`), so every custom tag
 * must be a distinct power of two. A tag of 0 matches nothing, and a tag such as 3 would be
 * unlocked by a view holding tag 1 or tag 2.
 */
export const PRIVATE_VIEW_TAG = 1;

export const PLAYER_IDENTITY_VIEW_TAG = 16;
