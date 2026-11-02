import { isTournamentRoundStartMode } from "@aegis/shared/tournaments/isTournamentRoundStartMode";
import { latestReleasedProductLabel } from "@aegis/shared/cards/cardPool";
import type { BanlistPolicy, CreateTournamentInput } from "@aegis/shared/tournaments/index";
import { TournamentCategory } from "@aegis/shared/tournaments/TournamentCategory";
import { isTournamentCategory } from "@aegis/shared/tournaments/isTournamentCategory";

export function parseCreateTournament(
  body: Record<string, unknown>,
): { input: CreateTournamentInput; block: string } | undefined {
  const { name, block, startsAt, maxPlayers, structure, topCut, bestOf, allowBots, banlist } = body;
  if (typeof name !== "string" || !Number.isFinite(startsAt) || !Number.isInteger(maxPlayers)) return undefined;
  if (structure !== undefined && structure !== "swiss" && structure !== "single_elimination") return undefined;
  if (bestOf !== undefined && bestOf !== 1 && bestOf !== 3) return undefined;
  if (body.description !== undefined && typeof body.description !== "string") {
    return undefined;
  }
  if (body.category !== undefined && !isTournamentCategory(body.category)) {
    return undefined;
  }
  if (body.roundStartMode !== undefined && !isTournamentRoundStartMode(body.roundStartMode)) {
    return undefined;
  }
  const policy = banlist === undefined ? ({ mode: "none" } as const) : parseBanlistPolicy(banlist);
  if (!policy) return undefined;
  return {
    input: {
      name,
      roundStartMode: body.roundStartMode,
      description: body.description as string | undefined,
      category: body.category ?? TournamentCategory.COMMUNITY.value,
      clocks: body.clocks as CreateTournamentInput["clocks"],
      password: body.password as string | undefined,
      format: body.format as CreateTournamentInput["format"],
      structure: structure ?? "single_elimination",
      topCut: topCut === true,
      bestOf: bestOf ?? 1,
      startsAt: Number(startsAt),
      maxPlayers: Number(maxPlayers),
      allowBots: allowBots === true,
      randomBotStyles: body.randomBotStyles === true,
      banlist: policy,
    },
    block: typeof block === "string" && block.trim() ? block.trim() : latestReleasedProductLabel(),
  };
}

function parseBanlistPolicy(value: unknown): BanlistPolicy | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { mode, setId } = value as { mode?: unknown; setId?: unknown };
  if (mode === "none" || mode === "current") return { mode };
  if (mode === "as_of_set" && typeof setId === "string") return { mode, setId };
  return undefined;
}
