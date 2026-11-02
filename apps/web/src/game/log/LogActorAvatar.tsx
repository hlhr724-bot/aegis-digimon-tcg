import type { Seat } from "@aegis/shared/schema/enums";
import { isDigimonWorldAvatarId } from "@aegis/shared";
import { Avatar } from "@/design/primitives";
import type { SeatAvatars } from "@/game/log/SeatAvatars";
import type { SeatNames } from "@/game/log/SeatNames";

type Props = {
  seat: Seat | undefined;
  playerNames: SeatNames;
  playerAvatars?: SeatAvatars;
  size?: number;
};

export function LogActorAvatar({ seat, playerNames, playerAvatars, size = 18 }: Props) {
  if (seat === undefined) {
    return <span className="play-log__marker" aria-hidden="true" />;
  }
  const avatarId = playerAvatars?.[seat];
  return (
    <span className="play-log__avatar" aria-hidden="true">
      <Avatar name={playerNames[seat]} avatarId={isDigimonWorldAvatarId(avatarId) ? avatarId : null} size={size} />
    </span>
  );
}
