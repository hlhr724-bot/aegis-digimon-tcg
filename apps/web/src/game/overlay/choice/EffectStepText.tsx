import "@/game/overlay/effectPromptFamily.css";
import { useResolvedCardText } from "@/i18n/useResolvedCardText";
import type { CardTextField } from "@/i18n/CardTextField";

export function EffectStepText({
  text: sourceText,
  emphasis,
  cardId,
  field,
  timing,
}: {
  text: string;
  emphasis?: string;
  cardId?: string;
  field?: CardTextField;
  timing?: string;
}) {
  const { text } = useResolvedCardText({
    text: sourceText,
    cardId,
    field,
    timing,
    surface: "decision",
    allowContext: true,
  });
  const start = emphasis ? text.toLowerCase().indexOf(emphasis.toLowerCase()) : -1;
  if (!emphasis || start < 0) return text;
  return (
    <>
      {text.slice(0, start)}
      <strong className="decision-overlay__effect-step">{text.slice(start, start + emphasis.length)}</strong>
      {text.slice(start + emphasis.length)}
    </>
  );
}
