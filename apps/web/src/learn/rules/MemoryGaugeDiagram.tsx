import { useTranslation } from "@/i18n/useTranslation";

const gaugeCells = Array.from({ length: 21 }, (_, index) => 10 - index);
const startCell = 3;
const endCell = -2;

function getCellSide(cell: number): "you" | "opponent" | "zero" {
  if (cell > 0) {
    return "you";
  }
  if (cell < 0) {
    return "opponent";
  }
  return "zero";
}

function getCellState(cell: number): "start" | "end" | undefined {
  if (cell === startCell) {
    return "start";
  }
  if (cell === endCell) {
    return "end";
  }
  return undefined;
}

export function MemoryGaugeDiagram() {
  const { t } = useTranslation();
  return (
    <figure className="rules-memory">
      <div className="rules-memory__sides" aria-hidden="true">
        <span>{t("learn.rules.memory.you")}</span>
        <span>{t("learn.rules.memory.opponent")}</span>
      </div>
      <ol className="rules-memory__gauge" aria-hidden="true">
        {gaugeCells.map((cell) => (
          <li key={cell} data-side={getCellSide(cell)} data-state={getCellState(cell)}>
            {Math.abs(cell)}
          </li>
        ))}
      </ol>
      <figcaption>{t("learn.rules.memory.example")}</figcaption>
    </figure>
  );
}
