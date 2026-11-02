import { useState } from "react";
import type { BotPersona } from "@aegis/shared/bot/personas/BotPersona";
import { getBotPortraitPath } from "@aegis/shared/bot/personas/getBotPortraitPath";
import "@/bot/personas/botPersonas.css";

export function BotPortrait({ persona, size = 48 }: { persona: BotPersona; size?: 18 | 48 }) {
  const sources = [getBotPortraitPath({ persona })];
  const sourceKey = sources.join("\n");
  const [failed, setFailed] = useState({ sourceKey, count: 0 });
  const index = failed.sourceKey === sourceKey ? failed.count : 0;
  const source = sources[index];
  const initials = persona.displayName
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("");
  return (
    <span className="bot-portrait" data-size={size} aria-hidden="true">
      {source ? <img src={source} alt="" onError={() => setFailed({ sourceKey, count: index + 1 })} /> : initials}
    </span>
  );
}
