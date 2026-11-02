import { GameMode } from "@aegis/shared/manual/GameMode";
// Test-only entry: production lobby with reproducible legal and incompatible decks.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Lobby } from "../src/screens/Lobby";
import { createBlankDeck, type DeckListing } from "../src/game/decks";
import { I18nProvider } from "../src/i18n";
import { loadMatchFormatPreference } from "../src/screens/matchFormatPreference";
import "../src/design/tokens.css";
import "../src/design/base.css";
import "../src/design/layout.css";
import "../src/design/primitives.css";

const eosmon: DeckListing = {
  ...createBlankDeck([], "Green", "Eosmon"),
  id: "eosmon",
  mainDeck: Array<string>(50).fill("BT6-085"),
  eggDeck: Array<string>(4).fill("BT1-002"),
  format: "BT13:pauper",
};
const banned: DeckListing = {
  ...eosmon,
  id: "banned",
  name: "Historical banned card",
  format: "BT13:unlimited",
  mainDeck: ["BT5-109", ...eosmon.mainDeck.slice(1)],
};
const later: DeckListing = {
  ...eosmon,
  id: "later",
  name: "Later set card",
  mainDeck: ["BT14-033", ...eosmon.mainDeck.slice(1)],
};
const sakuyamon: DeckListing = {
  ...eosmon,
  id: "sakuyamon",
  name: "Sakuyamon",
  format: "standard",
  coverCardId: "BT20-037",
  mainDeck: ["BT20-037", "BT17-035", "EX8-037", ...eosmon.mainDeck.slice(3)],
};

function FormatLobby() {
  const [activeDeckId, setActiveDeckId] = useState(eosmon.id);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.AUTOMATIC.value);
  const [request, setRequest] = useState("");
  const [timerOptions, setTimerOptions] = useState(() => ({
    matchTimer: true,
    timerStartSeconds: 300,
    timerRefillSeconds: 60,
  }));
  const [bestOf, setBestOf] = useState(loadMatchFormatPreference);
  return (
    <I18nProvider>
      <Lobby
        player={{ name: "Format Tester", color: "Green", shards: 0 }}
        decks={[eosmon, banned, later, sakuyamon]}
        activeDeckId={activeDeckId}
        onSelectDeck={setActiveDeckId}
        onCopyDeck={() => {}}
        onNav={() => {}}
        gameMode={gameMode}
        onGameModeChange={setGameMode}
        timerOptions={timerOptions}
        onTimerOptionsChange={setTimerOptions}
        bestOf={bestOf}
        onBestOfChange={setBestOf}
        onStart={(...args) => setRequest(JSON.stringify(args))}
      />
      <output role="status" aria-label="Match request" className="aegis-sr-only">
        {request}
      </output>
      <output role="status" aria-label="Match settings" className="aegis-sr-only">
        {JSON.stringify({ ...timerOptions, bestOf })}
      </output>
    </I18nProvider>
  );
}
createRoot(document.getElementById("root")!).render(<FormatLobby />);
