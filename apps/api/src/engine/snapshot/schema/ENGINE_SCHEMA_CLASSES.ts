import { AppFusionRoute, CardInstance, DigivolveRoute, DnaDigivolveRoute } from "@aegis/shared/schema/CardInstance";
import { CombatWindow, GameState, ManualTable, PendingDecision, SeriesState } from "@aegis/shared/schema/GameState";
import { Permanent } from "@aegis/shared/schema/Permanent";
import { PlayerState, SecurityCardView } from "@aegis/shared/schema/PlayerState";
import { EngineSchemaKind } from "#api/engine/snapshot/schema/EngineSchemaKind";

export const ENGINE_SCHEMA_CLASSES = [
  { key: EngineSchemaKind.CARD_INSTANCE.value, constructor: CardInstance },
  { key: EngineSchemaKind.PERMANENT.value, constructor: Permanent },
  { key: EngineSchemaKind.PLAYER_STATE.value, constructor: PlayerState },
  { key: EngineSchemaKind.GAME_STATE.value, constructor: GameState },
  { key: EngineSchemaKind.SECURITY_CARD_VIEW.value, constructor: SecurityCardView },
  { key: EngineSchemaKind.PENDING_DECISION.value, constructor: PendingDecision },
  { key: EngineSchemaKind.COMBAT_WINDOW.value, constructor: CombatWindow },
  { key: EngineSchemaKind.SERIES_STATE.value, constructor: SeriesState },
  { key: EngineSchemaKind.MANUAL_TABLE.value, constructor: ManualTable },
  { key: EngineSchemaKind.APP_FUSION_ROUTE.value, constructor: AppFusionRoute },
  { key: EngineSchemaKind.DIGIVOLVE_ROUTE.value, constructor: DigivolveRoute },
  { key: EngineSchemaKind.DNA_DIGIVOLVE_ROUTE.value, constructor: DnaDigivolveRoute },
] as const;
