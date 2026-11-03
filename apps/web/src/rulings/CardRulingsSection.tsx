import { useEffect, useState } from "react";
import type { CardRulings } from "@aegis/shared/cards/CardRulings";
import { fetchCardRulings } from "@/rulings/fetchCardRulings";
import { useTranslation } from "@/i18n";
import "./cardRulings.css";

type RulingsLoad = { cardId: string; rulings: CardRulings } | { cardId: string; failed: true };

function useCardRulings(cardId: string): RulingsLoad | undefined {
  const [load, setLoad] = useState<RulingsLoad>();
  useEffect(() => {
    const controller = new AbortController();
    fetchCardRulings(cardId, controller.signal)
      .then((rulings) => setLoad({ cardId, rulings }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ cardId, failed: true });
      });
    return () => controller.abort();
  }, [cardId]);
  return load?.cardId === cardId ? load : undefined;
}

export function CardRulingsSection({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const load = useCardRulings(cardId);
  let body;
  if (!load) {
    body = <p className="card-rulings__status">{t("rulings.loading")}</p>;
  } else if ("failed" in load) {
    body = <p className="card-rulings__status">{t("rulings.error")}</p>;
  } else if (!load.rulings.errata && load.rulings.questions.length === 0) {
    body = <p className="card-rulings__status">{t("rulings.empty")}</p>;
  } else {
    const { errata, questions } = load.rulings;
    body = (
      <>
        {errata ? (
          <div className="card-rulings__errata">
            <div className="card-rulings__subtitle">{t("rulings.errata", { date: errata.date })}</div>
            {errata.changes.map((change, index) => (
              <dl key={index}>
                <dt>{t("rulings.printed")}</dt>
                <dd>
                  <del>{change.before}</del>
                </dd>
                <dt>{t("rulings.corrected")}</dt>
                <dd>{change.after}</dd>
              </dl>
            ))}
          </div>
        ) : null}
        {questions.length > 0 ? (
          <ul className="card-rulings__questions">
            {questions.map((entry) => (
              <li key={entry.qno}>
                <details>
                  <summary>
                    <span className="card-rulings__number">{entry.qno}</span> {entry.question}
                  </summary>
                  <p>{entry.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }
  return (
    <section className="card-rulings" aria-labelledby="card-rulings-title">
      <div className="card-rulings__title" id="card-rulings-title">
        {load && !("failed" in load) && load.rulings.questions.length > 0
          ? t("rulings.titleWithCount", { count: load.rulings.questions.length })
          : t("rulings.title")}
      </div>
      {body}
      <a
        className="card-rulings__source"
        href={`https://world.digimoncard.com/rule/?card_no=${encodeURIComponent(cardId)}`}
        target="_blank"
        rel="noreferrer"
      >
        {t("rulings.source")}
      </a>
    </section>
  );
}
