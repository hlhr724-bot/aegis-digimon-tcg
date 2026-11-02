import { Icons } from "../../design/icons";
import { forcedAttackGrantText, type ForcedAttackGrant, type RestrictionBadge } from "../fieldBadges";
import { useTranslation } from "../../i18n";
import { BadgeHint } from "./BadgeHint";
import { useTranslatedCardName } from "@/i18n/useTranslatedCardName";

function BadgeIcon({ restriction }: { restriction: RestrictionBadge }) {
  if (restriction.action) return <Icons.Swords size={12} />;
  if (restriction.protection) return <Icons.ShieldCheck size={12} />;
  if (restriction.icon === "digimon") return <Icons.DigimonEffect size={12} />;
  if (restriction.icon === "option") return <Icons.OptionEffect size={12} />;
  if (restriction.icon === "tamer") return <Icons.TamerEffect size={12} />;
  if (restriction.icon === "allEffects") return <Icons.ShieldCheck size={12} />;
  if (restriction.icon === "attackOff") return <Icons.AttackOff size={12} />;
  if (restriction.icon === "blockOff") return <Icons.BlockOff size={12} />;
  if (restriction.icon === "suspendOff") return <Icons.SuspendOff size={12} />;
  if (restriction.icon === "unsuspendOff") return <Icons.UnsuspendOff size={12} />;
  if (restriction.icon === "digivolveOff") return <Icons.DigivolveOff size={12} />;
  if (restriction.icon === "effectOff") return <Icons.EffectOff size={12} />;
  if (restriction.icon === "dpShield") return <Icons.DpShield size={12} />;
  if (restriction.icon === "deDigivolveShield") return <Icons.DeDigivolveShield size={12} />;
  if (restriction.icon === "deleteShield") return <Icons.DeleteShield size={12} />;
  if (restriction.icon === "returnShield") return <Icons.ReturnShield size={12} />;
  return <Icons.Ban size={12} />;
}

export function PermanentRestrictionBadges({
  restrictions,
  forcedAttackGrants = [],
}: {
  restrictions: readonly RestrictionBadge[];
  forcedAttackGrants?: readonly ForcedAttackGrant[];
}) {
  const { t } = useTranslation();
  const getCardName = useTranslatedCardName();
  const maxVisibleBadges = 3;
  const orderedRestrictions = [...restrictions].sort(
    (a, b) => Number(Boolean(a.protection)) - Number(Boolean(b.protection)),
  );
  const visibleRestrictions = orderedRestrictions.slice(0, maxVisibleBadges);
  const hiddenRestrictions = orderedRestrictions.slice(visibleRestrictions.length);
  const describe = (restriction: RestrictionBadge) =>
    restriction.kind === "attacksAtStartOfMainPhase" && forcedAttackGrants.length > 0
      ? forcedAttackGrants.map((grant) => forcedAttackGrantText(grant, t, getCardName)).join(" ")
      : t(`redesign.arena.restriction.${restriction.kind}`);
  return (
    <div className="game-restriction-badges" aria-hidden="true">
      {visibleRestrictions.map((restriction) => (
        <BadgeHint
          key={restriction.kind}
          className="game-restriction-badge"
          data-protection={restriction.protection || undefined}
          data-action={restriction.action || undefined}
          data-label={t(restriction.labelKey)}
          title={t(restriction.labelKey)}
          hint={{
            title: t(restriction.labelKey),
            description: describe(restriction),
          }}
        >
          <i aria-hidden="true">
            <BadgeIcon restriction={restriction} />
          </i>
        </BadgeHint>
      ))}
      {hiddenRestrictions.length > 0 ? (
        <BadgeHint
          className="game-restriction-badge game-restriction-badge--overflow"
          data-label={hiddenRestrictions.map(({ labelKey }) => t(labelKey)).join(" · ")}
          title={hiddenRestrictions.map(({ labelKey }) => t(labelKey)).join(" · ")}
          hint={{
            title: t("redesign.arena.badge.moreTitle"),
            description: hiddenRestrictions
              .map((restriction) => `${t(restriction.labelKey)}: ${describe(restriction)}`)
              .join(" "),
          }}
        >
          <b>+{hiddenRestrictions.length}</b>
        </BadgeHint>
      ) : null}
    </div>
  );
}
