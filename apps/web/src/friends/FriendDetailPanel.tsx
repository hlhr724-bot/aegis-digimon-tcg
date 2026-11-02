import { useContext, useEffect, useState, useId } from "react";
import type { FriendDetail } from "@aegis/shared/friends/FriendDetail";
import { request } from "@/account/client";
import { ReplayVisibility } from "@aegis/shared/replays/ReplayVisibility";
import { StatStrip, SectionHeading } from "@/design/surfaces";
import { Icons } from "@/design/icons";
import { Dialog, Avatar, IconButton, Alert, Badge } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { FriendPresence } from "@/social/FriendPresence";
import { SocialContext } from "@/social/SocialContext";

type FriendDetailPanelParams = { accountId: string; onClose: () => void };

export function FriendDetailPanel({ accountId, onClose }: FriendDetailPanelParams) {
  const titleId = useId();
  const { t } = useTranslation();
  const social = useContext(SocialContext);
  const [detail, setDetail] = useState<FriendDetail>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void request<FriendDetail>(`/friends/${encodeURIComponent(accountId)}/detail`)
      .then((next) => {
        if (active) {
          setDetail(next);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [accountId, social.revision]);
  return (
    <Dialog className="friend-detail" labelledBy={titleId} onClose={onClose}>
      <header className="friend-detail-header">
        <h2 id={titleId}>{t("friends.detail")}</h2>
        <IconButton variant="ghost" label={t("common.close")} onClick={onClose}>
          <Icons.X size={20} />
        </IconButton>
      </header>
      {failed ? <Alert tone="danger">{t("friends.failed")}</Alert> : null}
      {!detail && !failed ? <p role="status">{t("common.loading")}</p> : null}
      {detail ? (
        <>
          <div className="friend-detail-person">
            <Avatar
              name={detail.friend.displayName}
              avatarId={detail.friend.avatarId ?? undefined}
              avatarUrl={detail.friend.avatarUrl ?? undefined}
              size={48}
            />
            <div>
              <h3>{detail.friend.displayName}</h3>
              <FriendPresence
                status={social.friends.find((friend) => friend.accountId === accountId)?.status ?? detail.friend.status}
              />
            </div>
          </div>
          {detail.stats ? (
            <StatStrip
              stats={[
                { label: t("friends.stats.matches"), value: detail.stats.matches },
                { label: t("friends.stats.wins"), value: detail.stats.wins },
                { label: t("friends.stats.losses"), value: detail.stats.losses },
              ]}
            />
          ) : (
            <Alert>{t("friends.stats.private")}</Alert>
          )}
          <SectionHeading level={3} title={t("friends.sharedReplays")} />
          {detail.replays.length === 0 ? (
            <p>{t("friends.noReplays")}</p>
          ) : (
            <ul className="friend-detail-replays">
              {detail.replays.map((replay) => (
                <li key={replay.id}>
                  <a href={`/replays/${encodeURIComponent(replay.id)}`}>
                    <Icons.Play size={20} />
                    <span>
                      <strong>{replay.summary.players.join(" vs ")}</strong>
                      <small>{new Date(replay.savedAt).toLocaleDateString()}</small>
                    </span>
                    <Badge>
                      {t(
                        replay.visibility === ReplayVisibility.FRIENDS.value
                          ? "friends.replayVisibility"
                          : "friends.publicReplay",
                      )}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
