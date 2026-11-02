import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { I18nProvider } from "@/i18n/I18nProvider";
import { applyDarkMode } from "@/design/darkMode";
import { Stage, Button, Logo } from "@/design/primitives";
import { FriendsScreen } from "@/friends/FriendsScreen";
import { QuickChatDock } from "@/messages/QuickChatDock";
import { useQuickChatState } from "@/messages/useQuickChatState";
import { SocialContext } from "@/social/SocialContext";
import type { SocialConnection } from "@/social/SocialConnection";
import type { DirectMessage } from "@aegis/shared/messages/DirectMessage";
import "@/design/tokens.css";
import "@/design/base.css";
import "@/design/layout.css";
import "@/design/primitives.css";

declare global {
  interface Window {
    quickChatFixtureMessages: DirectMessage[];
  }
}
const friend = {
  accountId: "friend",
  displayName: "Quick Friend",
  avatarId: null,
  avatarUrl: null,
  since: Date.now(),
  status: "online" as const,
  roomCode: "ROOM",
};
applyDarkMode();
function QuickChatFixture() {
  const quickChat = useQuickChatState({ accountId: "me" });
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [home, setHome] = useState(false);
  const [messageAcknowledgment, setAcknowledgment] = useState<SocialConnection["messageAcknowledgment"]>();
  const unread = messages.filter((message) => message.recipientId === "me" && message.readAt === null).length;
  window.quickChatFixtureMessages = messages;
  useEffect(() => {
    function receive(event: Event) {
      setMessages((current) => [...current, (event as CustomEvent<DirectMessage>).detail]);
    }
    window.addEventListener("quick-chat-fixture-message", receive);
    return () => window.removeEventListener("quick-chat-fixture-message", receive);
  }, []);
  function readMessages() {
    setMessages((current) =>
      current.map((message) => (message.recipientId === "me" ? { ...message, readAt: Date.now() } : message)),
    );
  }
  function sendMessage(friendId: string, body: string) {
    const requestId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: requestId, senderId: "me", recipientId: friendId, body, createdAt: Date.now(), readAt: Date.now() },
    ]);
    setAcknowledgment({ requestId, delivered: true });
    return requestId;
  }
  const social: SocialConnection = {
    accountId: "me",
    connected: true,
    friends: [friend],
    invites: [],
    revision: 0,
    unreadMessages: unread,
    messages,
    messageAcknowledgment,
    readMessages,
    sendMessage,
    quickChat,
    challenge: () => {},
    watch: () => {},
    dismissNotice: () => {},
    invite: () => {},
    answer: () => {},
    refresh: () => {},
  };
  return (
    <I18nProvider>
      <SocialContext value={social}>
        <Stage>
          <header className="quick-chat-fixture-header">
            <Logo />
            <nav>
              <Button variant="ghost" onClick={() => setHome(true)}>
                Home
              </Button>
              <Button variant="ghost" onClick={() => setHome(false)}>
                Friends
              </Button>
            </nav>
          </header>
          <div className="quick-chat-fixture-content">
            {home ? (
              <main className="friends-screen">
                <h1>Aegis</h1>
              </main>
            ) : (
              <FriendsScreen signedIn onSignIn={() => {}} />
            )}
          </div>
          <QuickChatDock />
        </Stage>
      </SocialContext>
    </I18nProvider>
  );
}
createRoot(document.getElementById("root")!).render(<QuickChatFixture />);
