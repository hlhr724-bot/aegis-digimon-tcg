import type { Seat } from "@aegis/shared/schema/enums";

export type SeatAvatars = Readonly<Record<Seat, string | undefined>>;
