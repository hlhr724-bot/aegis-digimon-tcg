import type {
  ProviderArchetype,
  ProviderPage,
  ProviderList,
  ProviderDetail,
} from "@aegis/shared/deckProviders/ProviderTypes";
import type { Express } from "express";
import type { ProviderClient } from "#api/deckProviders/ProviderClient";
import { ProviderError } from "#api/deckProviders/ProviderError";
import { getDeckProvider } from "#api/deckProviders/getDeckProvider";
import { isDeckFormat } from "@aegis/shared/deckFormat";
import { ProviderSort } from "@aegis/shared/deckProviders/ProviderSort";
import { tokenBucketLimiter } from "#api/http/rateLimit";

type Params = { app: Express; client: Pick<ProviderClient, "get"> };

export function installProviderRoutes({ app, client }: Params): void {
  const allow = tokenBucketLimiter({ capacity: 30, refillMs: 2000 });
  app.get("/deck-providers/:provider/:resource", async (req, res) => {
    if (!allow(req.ip ?? "unknown")) {
      res.status(429).set("Retry-After", "2").json({ error: "digilab_unavailable" });
      return;
    }
    const provider = getDeckProvider(req.params.provider);
    if (!provider) {
      res.sendStatus(404);
      return;
    }
    const resource = req.params.resource;
    const {
      page = "1",
      perPage = "20",
      format = "",
      archetype = "",
      search = "",
      sort = ProviderSort.DATE.value,
      playFormat = "standard",
    } = req.query;
    if (
      typeof perPage !== "string" ||
      !/^\d+$/.test(perPage) ||
      Number(perPage) < 1 ||
      Number(perPage) > 25 ||
      typeof page !== "string" ||
      !/^\d+$/.test(page) ||
      Number(page) < 1 ||
      Number(page) > 200 ||
      typeof format !== "string" ||
      !/^(?:[A-Z0-9.-]{1,20}|all)?$/.test(format) ||
      typeof archetype !== "string" ||
      !/^\d{0,10}$/.test(archetype) ||
      typeof search !== "string" ||
      search.length > 60 ||
      !Object.values(ProviderSort).some((entry) => entry.value === sort) ||
      !isDeckFormat(playFormat)
    ) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    let path: string;
    let kind: "meta" | "lists" | "detail";
    const listQuery = {
      format,
      page: Number(page),
      perPage: Number(perPage),
      archetype,
      search,
      sort: sort as ProviderSort,
    };
    if (resource === "meta") {
      kind = "meta";
      path = provider.buildMetaPath({ format, page: Number(page), perPage: Number(perPage) });
    } else if (resource === "lists") {
      kind = "lists";
      path = provider.buildListsPath(listQuery);
    } else if (/^[1-9]\d{0,10}$/.test(resource)) {
      kind = "detail";
      path = provider.buildDetailPath(Number(resource));
    } else {
      res.sendStatus(404);
      return;
    }
    try {
      if (kind === "lists" && !format) {
        const current = provider.parseResponse({
          body: await client.get(provider.buildMetaPath()),
          kind: "meta",
        }) as ProviderPage<ProviderArchetype>;
        const currentFormat = current.formats[0]?.id;
        if (currentFormat) {
          path = provider.buildListsPath({ ...listQuery, format: currentFormat });
        }
      }
      const result = provider.parseResponse({ body: await client.get(path), kind, format: playFormat });
      if (kind === "meta" && format) {
        const meta = result as ProviderPage<ProviderArchetype>;
        meta.data = await Promise.all(
          meta.data.map(async (archetype) => {
            const lists = provider.parseResponse({
              body: await client.get(provider.buildListsPath({ format, archetype: String(archetype.id), perPage: 3 })),
              kind: "lists",
            }) as ProviderPage<ProviderList>;
            let playableDeck: ProviderDetail | null = null;
            for (const list of lists.data.slice(0, 3)) {
              const detail = provider.parseResponse({
                body: await client.get(provider.buildDetailPath(list.id)),
                kind: "detail",
                format: playFormat,
              }) as ProviderDetail;
              if (detail.legality?.legal) {
                playableDeck = { ...detail, coverCardId: archetype.coverCardId ?? detail.coverCardId };
                break;
              }
            }
            return { ...archetype, playableDeck };
          }),
        );
      }
      res.json(result);
    } catch (error) {
      const failure = error instanceof ProviderError ? error : new ProviderError(503);
      if (failure.retryAfter) {
        res.set("Retry-After", String(failure.retryAfter));
      }
      res.status(failure.status).json({ error: "digilab_unavailable" });
    }
  });
}
