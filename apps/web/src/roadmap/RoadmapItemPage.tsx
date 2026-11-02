import { useEffect, useState } from "react";
import type { RoadmapItemDetail } from "@aegis/shared/roadmap/roadmapTypes";
import { AccountApiError } from "@/account/client";
import { Icons } from "@/design/icons";
import { Alert, Badge, Button } from "@/design/primitives";
import { relativeTime } from "@/i18n/relativeTime";
import { useTranslation } from "@/i18n/useTranslation";
import { ROADMAP_COLUMNS } from "@/roadmap/roadmapColumns";
import { roadmapClient } from "@/roadmap/roadmapClient";
import { RoadmapItemEditor } from "@/roadmap/RoadmapItemEditor";
import { RoadmapSupportButton } from "@/roadmap/RoadmapSupportButton";
import "@/roadmap/roadmap.css";

type RoadmapItemPageParams = {
  id: number;
  signedIn: boolean;
  isAdmin: boolean;
  onSignIn: () => void;
  onBack: () => void;
};

export function RoadmapItemPage({ id, signedIn, isAdmin, onSignIn, onBack }: RoadmapItemPageParams) {
  const { t, locale } = useTranslation();
  const [item, setItem] = useState<RoadmapItemDetail>();
  const [failure, setFailure] = useState<"missing" | "error">();
  useEffect(() => {
    const controller = new AbortController();
    setFailure(undefined);
    roadmapClient
      .detail(id, controller.signal)
      .then(setItem)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure(error instanceof AccountApiError && error.status === 404 ? "missing" : "error");
      });
    return () => controller.abort();
  }, [id]);
  const column = ROADMAP_COLUMNS.find((entry) => entry.status === item?.status);
  return (
    <article className="roadmap-item" aria-labelledby="roadmap-item-title">
      <Button variant="ghost" size="sm" icon={Icons.ArrowLeft} className="roadmap-item__back" onClick={onBack}>
        {t("roadmap.back")}
      </Button>
      {failure ? (
        <Alert tone="warning" title={t(failure === "missing" ? "roadmap.missing" : "roadmap.loadError")} />
      ) : null}
      {!failure && !item ? <p role="status">{t("common.loading")}</p> : null}
      {item ? (
        <>
          <header className="roadmap-item__header">
            {column ? (
              <Badge tone="primary" className="roadmap-item__status">
                {t(column.label)}
              </Badge>
            ) : null}
            <h2 id="roadmap-item-title" className="roadmap-item__title">
              {item.title}
            </h2>
            <p className="roadmap-item__meta">
              {t("roadmap.updated", { when: relativeTime({ at: item.updatedAt, locale }) })}
            </p>
          </header>
          <p className="roadmap-item__description">{item.description}</p>
          <div className="roadmap-item__actions">
            <RoadmapSupportButton
              item={item}
              signedIn={signedIn}
              onSignIn={onSignIn}
              onChanged={(updated) => setItem((current) => (current ? { ...current, ...updated } : current))}
              onFailed={() => setFailure("error")}
            />
            {item.discussionUrl ? (
              <a className="roadmap-item__discuss" href={item.discussionUrl} target="_blank" rel="noreferrer">
                <Icons.Discord size={16} />
                {t("roadmap.discuss")}
              </a>
            ) : null}
          </div>
          {isAdmin ? (
            <RoadmapItemEditor
              key={item.id}
              heading={t("roadmap.admin.manage")}
              initial={item}
              submitLabel={t("roadmap.admin.save")}
              onSubmit={async (draft) => setItem(await roadmapClient.update({ id: item.id, draft }))}
              onRemove={async () => {
                await roadmapClient.remove(item.id);
                onBack();
              }}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
