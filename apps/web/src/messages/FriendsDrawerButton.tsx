import { Icons } from "@/design/icons";
import { useFriendsDrawerLauncher } from "@/messages/useFriendsDrawerLauncher";

const BADGE_CAP = 9;

export function FriendsDrawerButton() {
  const launcher = useFriendsDrawerLauncher();
  if (!launcher) {
    return null;
  }
  return (
    <button
      className="aegis-icon-button friends-drawer-button"
      aria-label={launcher.label}
      title={launcher.label}
      aria-expanded={launcher.expanded}
      onClick={launcher.toggle}
    >
      <Icons.Users size={18} />
      {launcher.unread > 0 ? (
        <span className="friends-drawer-badge" aria-hidden="true">
          {launcher.unread > BADGE_CAP ? `${BADGE_CAP}+` : launcher.unread}
        </span>
      ) : null}
    </button>
  );
}
