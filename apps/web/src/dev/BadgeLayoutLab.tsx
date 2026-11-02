import { PermanentDpDeltaHint } from "@/game/piece/PermanentDpDeltaHint";
import { CardMini } from "../design/cards";
import type { RestrictionBadge } from "../game/fieldBadges";
import { PermanentRestrictionBadges } from "../game/piece/PermanentRestrictionBadges";
import "@/game/piece/fieldBadges.css";
import "@/game/game.css";
import "@/dev/badgeLayoutLab.css";

const protection: RestrictionBadge = {
  kind: "immuneToOpponentDigimonEffects",
  labelKey: "game.restriction.immuneToOpponentDigimonEffects",
  shortLabelKey: "game.protectionBadge.immuneToOpponentDigimonEffects",
  protection: true,
  icon: "digimon",
};

const attack: RestrictionBadge = {
  kind: "attacksAtStartOfMainPhase",
  labelKey: "game.restriction.attacksAtStartOfMainPhase",
  shortLabelKey: "game.badge.attacksAtStartOfMainPhase",
  action: true,
};

const cannotAttack: RestrictionBadge = {
  kind: "cannotAttack",
  labelKey: "game.restriction.cannotAttack",
  icon: "attackOff",
};

const SHOWN_DP = 2000;

const cases = [
  { title: "Suspended · protection", suspended: true, restrictions: [protection], dpDelta: undefined },
  { title: "Suspended · protection + DP", suspended: true, restrictions: [protection], dpDelta: -3000 },
  { title: "Active · forced attack + DP", suspended: false, restrictions: [attack], dpDelta: -3000 },
  {
    title: "Stress · three statuses",
    suspended: false,
    restrictions: [protection, attack, cannotAttack],
    dpDelta: -3000,
  },
] as const;

export function BadgeLayoutLab() {
  return (
    <main className="badge-lab">
      <header className="badge-lab__header">
        <p>FIELD STATUS QA</p>
        <h1>Badge layout lab</h1>
        <span>Real card size, real badge component, and the same clearance used above the memory gauge.</span>
      </header>
      <section className="badge-lab__grid" aria-label="Badge layout cases">
        {cases.map((item) => (
          <article className="badge-lab__case" key={item.title}>
            <h2>{item.title}</h2>
            <div className="badge-lab__field">
              <div className="badge-lab__security" aria-label="Opponent security clearance reference">
                5
              </div>
              <div className="badge-lab__permanent game-permanent" data-suspended={item.suspended || undefined}>
                <CardMini
                  cardId="BT15-047"
                  width={116}
                  suspended={item.suspended}
                  info
                  zoomOnHover={false}
                  dp={SHOWN_DP}
                  dpDelta={item.dpDelta}
                  renderDpDelta={(node) => (
                    <PermanentDpDeltaHint delta={item.dpDelta ?? 0} baseDp={SHOWN_DP - (item.dpDelta ?? 0)}>
                      {node}
                    </PermanentDpDeltaHint>
                  )}
                />
                <PermanentRestrictionBadges restrictions={item.restrictions} />
              </div>
              <div className="badge-lab__memory" aria-label="Memory clearance reference">
                {[1, 0, 1, 2, 3].map((value, index) => (
                  <span key={`${value}-${index}`}>{value}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
