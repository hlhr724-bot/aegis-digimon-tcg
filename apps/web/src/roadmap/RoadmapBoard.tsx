import { useEffect, useState } from "react";
import { RoadmapStatus } from "@aegis/shared/roadmap/RoadmapStatus";
import type { RoadmapItem } from "@aegis/shared/roadmap/roadmapTypes";
import { Alert, Button } from "@/design/primitives";
import { useTranslation } from "@/i18n/useTranslation";
import { ROADMAP_COLUMN_LIMIT, ROADMAP_COLUMNS } from "@/roadmap/roadmapColumns";
import { roadmapClient } from "@/roadmap/roadmapClient";
import { RoadmapSupportButton } from "@/roadmap/RoadmapSupportButton";
import "@/roadmap/roadmap.css";

function getSummary(description: string): string {
  return description.split(/\n\s*\n/)[0]!.trim();
}

type RoadmapBoardParams = {
  signedIn: boolean;
  onSignIn: () => void;
  onOpen: (id: number) => void;
};

export function RoadmapBoard({ signedIn, onSignIn, onOpen }: RoadmapBoardParams) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RoadmapItem[]>();
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lane, setLane] = useState<RoadmapStatus>(RoadmapStatus.IN_PROGRESS.value);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    roadmapClient
      .list(controller.signal)
      .then(setItems)
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [revision]);
  const replace = (updated: RoadmapItem) =>
    setItems((current) => current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
  return (
    <div className="roadmap-panel">
      <header className="roadmap-intro">
        <h2>{t("roadmap.title")}</h2>
        <p>{t("roadmap.subtitle")}</p>
        <p className="roadmap-note">{t("roadmap.note", { count: ROADMAP_COLUMN_LIMIT })}</p>
      </header>
      {failed ? (
        <Alert tone="warning" title={t("roadmap.loadError")}>
          <Button variant="secondary" size="sm" onClick={() => setRevision((value) => value + 1)}>
            {t("roadmap.retry")}
          </Button>
        </Alert>
      ) : null}
      {!failed && !items ? <p role="status">{t("common.loading")}</p> : null}
      {items ? (
        <>
          <div className="roadmap-switch" role="group" aria-label={t("community.roadmap.lanes")}>
            {ROADMAP_COLUMNS.map((column) => (
              <button
                key={column.status}
                type="button"
                aria-pressed={lane === column.status}
                onClick={() => setLane(column.status)}
              >
                {t(column.label)}
              </button>
            ))}
          </div>
          <div className="roadmap-board">
            {ROADMAP_COLUMNS.map((column) => {
              const columnItems = items.filter((item) => item.status === column.status).slice(0, ROADMAP_COLUMN_LIMIT);
              return (
                <section
                  key={column.status}
                  className="roadmap-column"
                  data-status={column.status}
                  data-active={lane === column.status ? true : undefined}
                  aria-labelledby={`roadmap-column-${column.status}`}
                >
                  <header className="roadmap-column__header">
                    <span className="roadmap-column__dot" aria-hidden="true" />
                    <h2 id={`roadmap-column-${column.status}`}>{t(column.label)}</h2>
                    <span className="roadmap-column__count" aria-hidden="true">
                      {columnItems.length}
                    </span>
                  </header>
                  {columnItems.length ? (
                    <ul>
                      {columnItems.map((item) => (
                        <li key={item.id} className="roadmap-card">
                          <a
                            className="roadmap-card__title"
                            href={`/roadmap/${item.id}`}
                            onClick={(event) => {
                              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
                                return;
                              }
                              event.preventDefault();
                              onOpen(item.id);
                            }}
                          >
                            {item.title}
                          </a>
                          <p className="roadmap-card__description">{getSummary(item.description)}</p>
                          <footer className="roadmap-card__footer">
                            <RoadmapSupportButton
                              item={item}
                              signedIn={signedIn}
                              onSignIn={onSignIn}
                              onChanged={replace}
                              onFailed={() => setFailed(true)}
                            />
                          </footer>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="roadmap-column__empty">{t("roadmap.empty")}</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
