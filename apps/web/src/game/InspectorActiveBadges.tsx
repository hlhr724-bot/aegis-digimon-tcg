import { Icons } from "@/design/icons";
import { EffectText } from "@/game/EffectText";
import { InspectorTone } from "@/game/InspectorTone";
import { formatResolvedKeyword } from "@/game/keywordDisplay";
import type { CardInspectionDetail } from "@/game/permanentDetail";
import type { RestrictionBadge } from "@/game/fieldBadges";
import { useTranslation } from "@/i18n/useTranslation";

type Params = { detail: CardInspectionDetail };

const restrictionIcons = {
  allEffects: Icons.ShieldCheck,
  digimon: Icons.DigimonEffect,
  option: Icons.OptionEffect,
  tamer: Icons.TamerEffect,
  attackOff: Icons.AttackOff,
  blockOff: Icons.BlockOff,
  suspendOff: Icons.SuspendOff,
  unsuspendOff: Icons.UnsuspendOff,
  digivolveOff: Icons.DigivolveOff,
  effectOff: Icons.EffectOff,
  dpShield: Icons.DpShield,
  deDigivolveShield: Icons.DeDigivolveShield,
  deleteShield: Icons.DeleteShield,
  returnShield: Icons.ReturnShield,
} satisfies Record<NonNullable<RestrictionBadge["icon"]>, typeof Icons.Shield>;

const keywordPresentations: Readonly<Record<string, { icon: typeof Icons.Shield; tone: string }>> = {
  Blocker: { icon: Icons.Shield, tone: InspectorTone.DEFENSE.value },
  Barrier: { icon: Icons.ShieldCheck, tone: InspectorTone.DEFENSE.value },
  Evade: { icon: Icons.ReturnShield, tone: InspectorTone.DEFENSE.value },
  ArmorPurge: { icon: Icons.DeleteShield, tone: InspectorTone.DEFENSE.value },
  Jamming: { icon: Icons.DpShield, tone: InspectorTone.DEFENSE.value },
  Reboot: { icon: Icons.RotateCcw, tone: InspectorTone.RECOVERY.value },
  Recovery: { icon: Icons.Heart, tone: InspectorTone.RECOVERY.value },
  Rush: { icon: Icons.FastForward, tone: InspectorTone.OFFENSE.value },
  Blitz: { icon: Icons.Rocket, tone: InspectorTone.OFFENSE.value },
  Raid: { icon: Icons.Swords, tone: InspectorTone.OFFENSE.value },
  Piercing: { icon: Icons.ArrowRight, tone: InspectorTone.OFFENSE.value },
  SecurityAttack: { icon: Icons.Swords, tone: InspectorTone.OFFENSE.value },
  Retaliation: { icon: Icons.AttackOff, tone: InspectorTone.OFFENSE.value },
};

export function InspectorActiveBadges({ detail }: Params) {
  const { t } = useTranslation();
  return (
    <>
      {detail.keywords.map((keyword) => {
        const presentation = keywordPresentations[keyword] ?? {
          icon: Icons.Sparkles,
          tone: InspectorTone.EFFECT.value,
        };
        const Icon = presentation.icon;
        const label = formatResolvedKeyword(keyword, detail.securityAttackModifier, detail.keywordLabels?.[keyword]);
        return (
          <span key={keyword} className="arena-inspector-badge" data-tone={presentation.tone} data-keyword={keyword}>
            <i aria-hidden="true">
              <Icon size={14} />
            </i>
            <EffectText inspector asciiBrackets text={`＜${label}＞`} />
          </span>
        );
      })}
      {detail.restrictions.map((restriction) => {
        let Icon = Icons.Ban;
        let tone: string = InspectorTone.RESTRICTION.value;
        if (restriction.protection) {
          Icon = Icons.ShieldCheck;
          tone = InspectorTone.DEFENSE.value;
        }
        if (restriction.action) {
          Icon = Icons.Swords;
          tone = InspectorTone.OFFENSE.value;
        }
        if (restriction.icon) {
          Icon = restrictionIcons[restriction.icon];
        }
        return (
          <span
            key={restriction.kind}
            className="arena-inspector-badge"
            data-tone={tone}
            data-restriction={restriction.kind}
          >
            <i aria-hidden="true">
              <Icon size={14} />
            </i>
            {t(restriction.labelKey)}
          </span>
        );
      })}
      {detail.heldDpEffects.map((held, index) => (
        <span
          key={`held-dp-${index}`}
          className="arena-inspector-badge"
          data-tone={held.delta < 0 ? InspectorTone.RESTRICTION.value : InspectorTone.EFFECT.value}
          data-held-dp={held.delta}
        >
          <i aria-hidden="true">
            <Icons.Clock size={14} />
          </i>
          {t("overlay.heldDp", {
            delta: `${held.delta > 0 ? "+" : "−"}${Math.abs(held.delta).toLocaleString()}`,
          })}
          {" · "}
          {t(held.expiryKey)}
        </span>
      ))}
    </>
  );
}
