const AEGIS_BOT_PORTRAIT = "/assets/bot-portraits/aegis-transparent.webp";

export function TournamentBotPortrait({ size }: { size: "small" | "large" }) {
  return (
    <span className="tournaments-bot-portrait" data-size={size} aria-hidden="true">
      <img src={AEGIS_BOT_PORTRAIT} alt="" />
    </span>
  );
}
