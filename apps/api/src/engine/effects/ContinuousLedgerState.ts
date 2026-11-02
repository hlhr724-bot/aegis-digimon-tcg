import type { Seat } from "@aegis/shared/schema/enums";
import type {
  RestrictionEntry,
  PlayerRestrictionEntry,
  AttackTargetRestriction,
  CanAttackUnsuspendedGrant,
  VortexCanAttackPlayersGrant,
  SuspendRestrictionSource,
  UnsuspendedDigivolveProhibition,
  DigivolveIntoConstraint,
  NameTraitGrant,
  OriginalCardInfoOverride,
  ColorWaiver,
  KeywordGrant,
  PlayerKeywordGrant,
  PlayerCustomEffectGrant,
  LinkMaxGrant,
  LinkCostReductionGrant,
  KindGrant,
  CannotIgnoreDigivolutionFlag,
  SecurityAddRestriction,
  ColorGrant,
  StackTrashLock,
  SeatStackTrashLock,
  StackCardTrashLock,
  SecurityAttackInversion,
  StackEffectConferral,
} from "#api/engine/effects/continuous/entries";
import type {
  OnDeletionAtEndOfAttackProjection,
  CustomEffectGrant,
  MemoryGainPolicy,
  CostReductionBlock,
  PlayProhibition,
  SecurityEffectDisable,
  EffectTimingDisable,
  PlayerEffectTimingDisable,
  DnaLevelOverride,
} from "#api/engine/effects/continuous/policies";

export type ContinuousLedgerState = {
  restrictions: RestrictionEntry[];
  playerRestrictions: PlayerRestrictionEntry[];
  attackTargetRestrictions: AttackTargetRestriction[];
  canAttackUnsuspendedGrants: CanAttackUnsuspendedGrant[];
  vortexCanAttackPlayersGrants: VortexCanAttackPlayersGrant[];
  suspendRestrictionSources: SuspendRestrictionSource[];
  unsuspendedDigivolveProhibitions: UnsuspendedDigivolveProhibition[];
  digivolveIntoConstraints: DigivolveIntoConstraint[];
  nameTraitGrants: NameTraitGrant[];
  originalCardInfoOverrides: OriginalCardInfoOverride[];
  colorWaivers: ColorWaiver[];
  keywordGrants: KeywordGrant[];
  playerKeywordGrants: PlayerKeywordGrant[];
  playerCustomEffectGrants: PlayerCustomEffectGrant[];
  linkMaxGrants: LinkMaxGrant[];
  linkCostReductionGrants: LinkCostReductionGrant[];
  kindGrants: KindGrant[];
  cannotIgnoreDigivolutionFlags: CannotIgnoreDigivolutionFlag[];
  securityAddRestrictions: SecurityAddRestriction[];
  colorGrants: ColorGrant[];
  stackTrashLocks: StackTrashLock[];
  seatStackTrashLocks: SeatStackTrashLock[];
  stackCardTrashLocks: StackCardTrashLock[];
  securityAttackInversions: SecurityAttackInversion[];
  stackEffectConferrals: StackEffectConferral[];
  onDeletionAtEndOfAttackProjections: OnDeletionAtEndOfAttackProjection[];
  customEffectGrants: CustomEffectGrant[];
  memoryGainPolicies: MemoryGainPolicy[];
  costReductionBlocks: CostReductionBlock[];
  playProhibitions: PlayProhibition[];
  securityEffectDisables: SecurityEffectDisable[];
  effectTimingDisables: EffectTimingDisable[];
  playerEffectTimingDisables: PlayerEffectTimingDisable[];
  dnaLevelOverrides: DnaLevelOverride[];
  durationOwners: [object, Seat][];
  battleScopes: Map<number, { parent?: number; entries: Set<object> }>;
  expiredAffectationRecipients: Set<string>;
  grantsOfCardsThatLeftField: Set<CustomEffectGrant>;
  nextCustomEffectGrantId: number;
};
