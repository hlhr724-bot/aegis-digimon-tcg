type Params = { name: string; tournamentId: string };

export function getTournamentDiscordChannelName({ name, tournamentId }: Params): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `torneio-${(slug || "evento").slice(0, 82).replace(/-+$/g, "")}-${tournamentId.slice(0, 8)}`;
}
