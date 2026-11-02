/**
 * Colyseus channel name constants shared by client and server.
 *
 * Channels (API-CONTRACT "Channels summary"):
 *   - automatic state sync   server -> client  (GameState deltas, filtered per seat)
 *   - EVENT_CHANNEL          server -> client  (ServerEvent; actionRejected is unicast)
 *   - DECISION_CHANNEL       server -> client  (DecisionRequest; unicast to the deciding seat)
 *   - <intent.type>          client -> server  (the room registers onMessage("*"))
 */
export const EVENT_CHANNEL = "event" as const;
export const DECISION_CHANNEL = "decision" as const;

/** The Colyseus room type registered via gameServer.define(ROOM_TYPE, AegisRoom). */
export const ROOM_TYPE = "aegis" as const;

/** One-human room created directly for a match against the server bot. It accepts beta-only cards. */
export const ROOM_TYPE_BOT = "aegis_bot" as const;
export const ROOM_TYPE_BETA_BOT = "aegis_beta_bot" as const;

/** Public matchmaking queue whose result affects player statistics. */
export const ROOM_TYPE_RANKED = "aegis_ranked" as const;

/**
 * How long a seat whose socket dropped stays reserved before the drop resolves as a
 * concession. The server owns the clock; the client only uses this to show a countdown.
 */
export const RECONNECT_GRACE_SECONDS = 60;

/**
 * Public matchmaking queue that allows cards from an announced-but-unreleased product
 * (`isBetaOnlyCard`, e.g. EX13 ahead of its street date). Ranked and tournament rooms reject
 * such a card at deck-validation time; private and bot rooms accept it (see {@link ROOM_TYPE_PRIVATE}
 * and {@link ROOM_TYPE_BOT}).
 */
export const ROOM_TYPE_BETA = "aegis_beta" as const;

/** Authenticated rooms bound to one server-owned tournament bracket match. */
export const ROOM_TYPE_TOURNAMENT = "aegis_tournament" as const;

/**
 * Private room type — registered with the same class but isolated from the public matchmaker.
 * Invite-only, so an unreleased-product card is legal here without a beta flag.
 */
export const ROOM_TYPE_PRIVATE = "aegis_private" as const;

/** Separate unranked queue with printed copy limits and no banlist. */
export const ROOM_TYPE_UNLIMITED = "aegis_unlimited" as const;

export const ROOM_TYPE_MANUAL = "aegis_manual" as const;
export const ROOM_TYPE_MANUAL_PRIVATE = "aegis_manual_private" as const;
