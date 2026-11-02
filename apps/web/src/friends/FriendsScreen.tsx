import { useContext, useId } from "react";
import { SocialContext } from "@/social/SocialContext";
import { FriendListItem } from "@/friends/FriendListItem";
import { FriendConversationRow } from "@/friends/FriendConversationRow";
import { useEffect, useState, type FormEvent } from "react";
import type { Friend } from "@aegis/shared/friends/Friend";
import type { FriendRequest } from "@aegis/shared/friends/FriendRequest";
import { SocialStatus } from "@aegis/shared/social/SocialStatus";
import { FriendRequestDirection } from "@aegis/shared/friends/FriendRequestDirection";
import { Icons } from "@/design/icons";
import { Panel, Field, Badge, Alert } from "@/design/primitives";
import { Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import type { TranslationKey } from "@/i18n/translationTypes";
import { friendsApi } from "@/friends/friendsApi";
import { getFriendErrorKey } from "@/friends/getFriendErrorKey";
import "@/friends/friends.css";

type FriendsScreenParams = { signedIn: boolean; onSignIn: () => void; compact?: boolean };
type FriendsData = { friends: Friend[]; requests: FriendRequest[]; blocks: Friend[] };

export function FriendsScreen({ signedIn, onSignIn, compact = false }: FriendsScreenParams) {
  const displayNameId = useId();
  const Root = compact ? "section" : "main";
  const social = useContext(SocialContext);
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const quickChat = social.quickChat;
  const [tab, setTab] = useState<keyof FriendsData>("friends");
  const [data, setData] = useState<FriendsData>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<TranslationKey>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      setData(undefined);
      return;
    }
    let active = true;
    setFailed(false);
    void Promise.all([friendsApi.list(), friendsApi.requests(), friendsApi.blocks()])
      .then(([friends, requests, blocks]) => {
        if (active) {
          setData({ ...friends, ...requests, ...blocks });
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
  }, [signedIn, revision, social.revision]);

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(undefined);
    try {
      await action();
      setRevision((value) => value + 1);
      social.refresh();
    } catch (error) {
      setNotice(getFriendErrorKey(error));
    } finally {
      setBusy(false);
    }
  }

  function addFriend(event: FormEvent) {
    event.preventDefault();
    void runAction(async () => {
      const result = await friendsApi.add({ displayName: name.trim() });
      setNotice(result.accepted ? "friends.accepted" : "friends.sent");
      setName("");
    });
  }

  const hasIncoming = (data?.requests ?? []).some(
    (request) => request.direction === FriendRequestDirection.INCOMING.value,
  );
  const visibleFriends = (data?.[tab] ?? [])
    .filter((friend) => friend.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((first, second) => {
      if (tab === "friends") {
        const firstStatus = social.friends.find((friend) => friend.accountId === first.accountId)?.status;
        const secondStatus = social.friends.find((friend) => friend.accountId === second.accountId)?.status;
        function getPriority(status: typeof firstStatus): number {
          return Object.values(SocialStatus).find((entry) => entry.value === status)?.priority ?? 0;
        }
        const difference = getPriority(secondStatus) - getPriority(firstStatus);
        if (difference) {
          return difference;
        }
      }
      return first.displayName.localeCompare(second.displayName);
    });

  const addFriendPanel = (
    <Panel className="friends-add-panel">
      <h2>
        <Icons.Users size={20} />
        {t("friends.add")}
      </h2>
      <form className="friends-form" onSubmit={addFriend}>
        <div>
          <Field
            label={t("friends.displayName")}
            id={displayNameId}
            autoComplete="off"
            maxLength={32}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Button disabled={busy || !name.trim()} type="submit">
            {t("friends.add")}
          </Button>
        </div>
      </form>
      <p>{t("friends.addHint")}</p>
    </Panel>
  );

  return (
    <Root className={`friends-screen${compact ? " friends-screen-compact" : ""}`}>
      {social.error && !social.connected ? <p role="alert">{t("friends.socialFailed")}</p> : null}
      <header className="friends-header" hidden={compact}>
        <div>
          <h1>{t("friends.title")}</h1>
          <p>{t("friends.description")}</p>
        </div>
        {signedIn ? (
          <span role="status">
            <Badge tone={social.connected ? "success" : "neutral"}>
              {t(social.connected ? "friends.connected" : "friends.connecting")}
            </Badge>
          </span>
        ) : null}
      </header>
      {!signedIn ? (
        <Button onClick={onSignIn}>{t("friends.signIn")}</Button>
      ) : (
        <>
          <div className="friends-workspace">
            <section className="friends-directory">
              <nav className="friends-tabs" aria-label={t("friends.title")}>
                {(["friends", "requests", "blocks"] as const).map((key) => (
                  <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>
                    {t(`friends.tab.${key}`)}
                    {data ? " " : null}
                    {data ? (
                      <span className="friends-tab-count" data-alert={(key === "requests" && hasIncoming) || undefined}>
                        {data[key].length}
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
              {compact ? (
                <label className="friends-search">
                  <Icons.Search size={18} />
                  <input
                    type="search"
                    aria-label={t("friends.search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("friends.searchHint")}
                  />
                </label>
              ) : (
                <Field
                  label={t("friends.search")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("friends.searchHint")}
                  type="search"
                />
              )}
              {notice ? <Alert>{t(notice)}</Alert> : null}
              {failed ? (
                <div role="alert">
                  <p>{t("friends.failed")}</p>
                  <Button onClick={() => setRevision((value) => value + 1)}>{t("friends.retry")}</Button>
                </div>
              ) : null}
              {!data && !failed ? (
                <p role="status" aria-busy="true">
                  {t("common.loading")}
                </p>
              ) : null}
              {data ? (
                <section aria-label={t(`friends.tab.${tab}`)} aria-busy={busy}>
                  {data[tab].length === 0 ? <p className="friends-empty">{t(`friends.empty.${tab}`)}</p> : null}
                  {query && !visibleFriends.length ? <p className="friends-empty">{t("friends.noResults")}</p> : null}
                  <ul className="friends-list">
                    {visibleFriends.map((friend) =>
                      compact && tab === "friends" ? (
                        <FriendConversationRow
                          key={friend.accountId}
                          friend={friend}
                          summary={social.conversations?.find((entry) => entry.friendId === friend.accountId)}
                          busy={busy}
                          onAction={runAction}
                          onOpen={(target) => quickChat?.openChat(target)}
                          selected={quickChat?.friend?.accountId === friend.accountId && quickChat?.expanded === true}
                        />
                      ) : (
                        <FriendListItem
                          key={friend.accountId}
                          friend={friend}
                          tab={tab}
                          busy={busy}
                          onAction={runAction}
                          onMessage={(target) => quickChat?.openChat(target)}
                          selected={quickChat?.friend?.accountId === friend.accountId && quickChat?.expanded === true}
                        />
                      ),
                    )}
                  </ul>
                </section>
              ) : null}
            </section>
            {!compact ? <aside className="friends-sidebar">{addFriendPanel}</aside> : null}
          </div>
        </>
      )}
    </Root>
  );
}
