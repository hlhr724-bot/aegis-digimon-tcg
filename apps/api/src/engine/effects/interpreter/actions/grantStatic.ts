import { createTrackedPermanentFilterMatch } from "#api/engine/effects/interpreter/matching/createTrackedPermanentFilterMatch";
import { getFieldEffectText } from "#api/engine/effects/interpreter/getFieldEffectText";
// The GrantStatic action: name, trait, kind, and borrowed-effect grants.

import type { EffectContext } from "../../EffectContext.js";
import { toDuration } from "../duration.js";
import { unsupported } from "../errors.js";
import { COLOR_MAP, PROTECTION_STRING_TOKEN_MAP, PROTECTION_TOKEN_MAP } from "../maps.js";
import { DefinitionFacts, definitionMatches, parseCopyEffectsFilterText } from "../matching/definition.js";
import { permanentMatchesFilter, seatsForController } from "../matching/permanent.js";
import { affectabilityBySource, resolvePermanentTargets } from "../targeting/permanents.js";
import { CardColor, CardKind, effectiveStaticNames, effectiveSubstringOnlyNames } from "@aegis/shared";
import type { Action } from "@aegis/shared";

export async function runGrantStaticAction(ctx: EffectContext, action: Action): Promise<boolean> {
  switch (action.kind) {
    case "DynamicDigivolutionNames": {
      const self = ctx.source.permanent();
      if (self === undefined || ctx.fx.grantDynamicNames === undefined) return false;
      ctx.fx.grantDynamicNames(
        self.permanentId,
        () => {
          const current = ctx.source.permanent();
          if (current === undefined) return [];
          const names = Array.from(current.stack).flatMap((card) => {
            const definition = ctx.game.definitionOf(card);
            return (definition.level ?? 99) <= 3 ? effectiveStaticNames(definition) : [];
          });
          return [...new Set(names)];
        },
        toDuration("permanent"),
      );
      return false;
    }
    case "GrantStatic": {
      // Registration metadata consumed by the digivolve-cost path. Its live field/turn/OPT
      // gates are enforced when GameEngine selects an eligible redirector permanent.
      if (action.grant === "digisorptionRedirect") return false;
      // Q4561: an unaffected Digimon can receive a triggered effect. Its immunity
      // is checked when that gained effect would trigger, rather than when granted.
      const grantsTriggeredEffect =
        typeof action.grant === "string" &&
        ["effects", "effect", "tokenEffect", "quotedEffect", "gainEffect"].includes(action.grant) &&
        (action.tokens ?? []).some((token) => token !== "get -5000DP");
      const grantsOriginalCardInfo =
        typeof action.grant === "object" &&
        action.grant !== null &&
        ("dp" in action.grant || "color" in action.grant || "originalName" in action.grant);
      const ids = await resolvePermanentTargets(ctx, action.target, {
        preserveUnaffectableSelection: grantsTriggeredEffect || grantsOriginalCardInfo,
      });
      const duration = toDuration("permanent");
      // "nameForDigiXros" (BT19-038) and grant:"name" with digiXrosOnly:true (BT19-012,
      // BT19-051, BT19-061) both encode an alias valid ONLY in DigiXros material matching.
      if (action.grant === "nameForDigiXros" || (action.grant === "name" && action.digiXrosOnly)) {
        const tokens = action.tokens ?? [];
        if (tokens.length === 0) {
          unsupported(ctx, action, "GrantStatic nameForDigiXros with no tokens");
          return false;
        }
        for (const id of ids) ctx.fx.grantNameTrait(id, "name", tokens, duration, { digiXrosOnly: true });
        return false;
      }
      if (action.grant === "name" || action.grant === "trait") {
        const tokens = action.tokens ?? [];
        if (tokens.length === 0) {
          unsupported(ctx, action, "GrantStatic name/trait with no tokens");
          return false;
        }
        // Older self-static IR records omit the distinction between a full name and
        // "having [X] in its name". Preserve the printed inclusion-only channel.
        const printedInclusions = new Set(
          action.grant === "name" && ctx.continuousPass && (action.target.isSelf || action.target.filter.isSelfRef)
            ? effectiveSubstringOnlyNames(ctx.source.definition).map((name) => name.toLowerCase())
            : [],
        );
        const inclusionTokens = tokens.filter(
          (token) => action.nameContainsOnly === true || printedInclusions.has(token.toLowerCase()),
        );
        const exactTokens = tokens.filter((token) => !inclusionTokens.includes(token));
        for (const id of ids) {
          for (const [names, containsOnly] of [
            [exactTokens, false],
            [inclusionTokens, true],
          ] as const) {
            if (names.length === 0) continue;
            ctx.fx.grantNameTrait(id, action.grant, names, duration, {
              fromRule: ctx.activeTiming === "Rule",
              nameContainsOnly: containsOnly,
            });
          }
        }
        return false;
      }
      if (action.grant === "colorFromLastTrashed") {
        const trashedIds = ctx.boundPlayed?.get("trashedCard") ?? new Set<string>();
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const trashedId of trashedIds) {
          const trashed = ctx.game.player(ctx.source.ownerSeat).trash.find((card) => card.instanceId === trashedId);
          if (trashed === undefined) continue;
          const colors = ctx.game.definitionOf(trashed).colors as (keyof typeof COLOR_MAP)[];
          for (const id of ids) {
            for (const color of colors) {
              const mapped = COLOR_MAP[color];
              if (mapped !== undefined) ctx.fx.addColorGrant(id, mapped, grantDuration);
            }
          }
        }
        return false;
      }
      if (action.grant === "color") {
        const colors = (action.tokens ?? []).filter((token): token is keyof typeof COLOR_MAP => token in COLOR_MAP);
        if (colors.length === 0) {
          unsupported(ctx, action, "GrantStatic color with no valid color token");
          return false;
        }
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const id of ids) {
          for (const color of colors) ctx.fx.addColorGrant(id, COLOR_MAP[color], grantDuration);
        }
        return false;
      }
      // BT8-040: the preceding optional Trash action grants this Digimon every printed
      // color of the card actually trashed, for the turn. The effect-result binding is
      // intentionally read from the current resolution context, so a declined or
      // unsuccessful trash grants nothing.
      if (action.grant === "colorFromLastTrashed") {
        const trashed = ctx.lastTrashedCards ?? [];
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const record of trashed) {
          const colors = ctx.game.definitionOf({ cardId: record.cardId } as never).colors;
          for (const id of ids) {
            for (const color of colors) ctx.fx.addColorGrant(id, color, grantDuration);
          }
        }
        return false;
      }
      if (action.grant === "kinds") {
        const wantedKinds = (action.tokens ?? []).map((t) => t as CardKind);
        if (wantedKinds.length === 0) {
          unsupported(ctx, action, "GrantStatic kinds with no tokens");
          return false;
        }
        // Unlike the name/trait grant above (which must survive turn boundaries per
        // WR-03/ENG-02), a "treated as a Digimon" kind grant is commonly scoped ("For the
        // turn, ..." — AD1-021, BT12-092, BT21-044) and must respect the IR's own duration
        // instead of the hardcoded `permanent` default the block computes above.
        const kindDuration = toDuration(action.duration ?? "permanent");
        for (const id of ids) ctx.fx.grantKind?.(id, wantedKinds, kindDuration);
        return false;
      }
      // path — "1 of your Digimon gains '[On Deletion] …' until the end of your opponent's
      // turn", RB1-030). Each token names a built-in effect the grant collector compiles to a
      // real Effect anchored on the granted permanent, so it fires through the SAME timing
      // window as a printed effect. This is duration-scoped (NOT permanent / NOT continuous):
      //
      // "effect"/"tokenEffect"/"quotedEffect"/"gainEffect" are the SAME grant under different
      // compiler-emitted labels (confirmed by shape: BT21-057's "tokenEffect" carries a
      // synthetic "GRANTEFFECT23TOKEN" key indistinguishable from an "effects" token; RB1-030's
      // "quotedEffect" carries the printed effect text verbatim as the token). Routing all four
      // through the same `grantCustomEffect` call wires a real consumer for every one of them —
      // `grantedTokenEffectsForTiming` already throws loudly for any token with no
      // `GRANTED_EFFECT_LIBRARY` entry, so an unregistered token now fails fast instead of
      // silently sitting inert in the old `grantCustom` bucket.
      if (
        (action.grant === "effects" ||
          action.grant === "effect" ||
          action.grant === "tokenEffect" ||
          action.grant === "quotedEffect" ||
          action.grant === "gainEffect") &&
        (action.tokens?.length ?? 0) > 0
      ) {
        const isDurationScopedDPGrant = action.tokens?.includes("get -5000DP") === true;
        const nextOpponentTurnDuration = isDurationScopedDPGrant && action.duration === "untilOpponentNextTurnEnd";
        const grantDuration = nextOpponentTurnDuration
          ? toDuration("untilOpponentTurnEnd")
          : toDuration(action.duration ?? "untilOpponentTurnEnd");
        // EX4-074's generated catalog uses the literal phrase "get -5000DP" for a
        // continuous grant, not a triggered ability. Installing it in the named-effect
        // ledger would make it invisible to the DP calculator, so apply the duration-scoped
        // modifier directly to the selected permanents.
        if (isDurationScopedDPGrant) {
          for (const id of ids) {
            ctx.fx.modifyDP(id, -5000, grantDuration, {
              skipsCurrentOpponentTurnEnd: nextOpponentTurnDuration && !ctx.source.isOwnersTurn(),
            });
          }
        }
        const isAffectedByGranter = affectabilityBySource(ctx);
        const matchesTarget = (permanentId: string): boolean => {
          const permanent = ctx.game.permanentById(permanentId);
          return permanent !== undefined && permanentMatchesFilter(ctx, permanent, action.target.filter, ctx.source);
        };
        const tracksTargetFilter = action.includeLaterEntrants === true;
        const recipientIds = tracksTargetFilter
          ? ctx.game.player(ctx.source.ownerSeat).battleArea.map((permanent) => permanent.permanentId)
          : ids;
        for (const id of recipientIds) {
          // Anchor the grant on the granted Digimon's TOP-CARD instance (persists into trash) and
          // the granter's seat (the duration-sweep frame), so a granted [On Deletion] fires on the
          // grantee's own deletion exactly like a printed one.
          const permanent = ctx.game.permanentById(id);
          const top = permanent?.topCard;
          if (top === undefined) continue;
          for (const token of action.tokens ?? []) {
            if (token === "get -5000DP") continue;
            ctx.fx.grantCustomEffect?.(top.instanceId, ctx.source.ownerSeat, token, grantDuration, {
              isActive: tracksTargetFilter
                ? () => isAffectedByGranter(id) && matchesTarget(id)
                : () => isAffectedByGranter(id),
            });
          }
        }
        // Q1907: BT9-102's "all ... gain [On Play]" grant also covers qualifying Digimon
        // entering after the option resolves. Keep a player-scoped filtered grant so the engine
        // can materialize it before a newly-entered Digimon's own On Play window (an ordinary
        // onEnterFieldAnyone watcher runs after that window and would be too late).
        if (action.includeLaterEntrants === true) {
          for (const token of action.tokens ?? []) {
            if (token === "get -5000DP") continue;
            ctx.fx.grantPlayerCustomEffect?.(
              ctx.source.ownerSeat,
              ctx.source.ownerSeat,
              token,
              grantDuration,
              matchesTarget,
            );
          }
        }
        return false;
      }
      // "effects"/"kind" paired with a `staticEffect: { kind: "SetBaseDP" }` payload (BT12-092,
      // BT13-018): "1 of your [X] is also treated as an N DP Digimon" — a DP override, plus (for
      // grant:"kind") a kind grant so a Tamer becomes attack-legal as a Digimon. Both primitives
      // already exist; this just wires the compound grant to them instead of the dead store.
      if (
        (action.grant === "effects" || action.grant === "kind") &&
        typeof action.staticEffect === "object" &&
        action.staticEffect !== null &&
        (action.staticEffect as { kind?: string }).kind === "SetBaseDP"
      ) {
        const value = (action.staticEffect as { value?: number }).value;
        if (typeof value !== "number") {
          unsupported(ctx, action, "GrantStatic SetBaseDP staticEffect with no numeric value");
          return false;
        }
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const id of ids) {
          ctx.fx.setBaseDP(id, value, grantDuration);
          const keyword = (action.staticEffect as { keyword?: string }).keyword;
          if (keyword !== undefined) ctx.fx.grantKeyword(id, keyword, grantDuration);
          const restriction = (action.staticEffect as { restriction?: string }).restriction;
          if (restriction !== undefined) ctx.fx.restrict(id, restriction as never, grantDuration);
        }
        if (action.grant === "kind") {
          const wantedKinds = (action.tokens ?? []).map((t) => t as CardKind);
          if (wantedKinds.length > 0) {
            for (const id of ids) ctx.fx.grantKind?.(id, wantedKinds, grantDuration);
          }
        }
        return false;
      }
      // "effects" with a structured `filter` and no tokens: "gains all effects of cards with
      // [X] in its digivolution cards" (BT10-011, BT12-072, BT15-039, BT16-014, RB1-009, ...).
      // This is the SAME conferStackEffects consumer the bottom-of-case fallback below already
      // uses for an untagged grant — it was simply unreachable from here because the string
      // catch-all intercepted `grant === "effects"` first.
      if (action.grant === "effects" && action.filter) {
        for (const permanentId of ids) {
          const permanent = ctx.game.permanentById(permanentId);
          if (permanent === undefined) continue;
          const matches = permanent.stack.filter(
            (stackCard) =>
              stackCard.faceUp !== false &&
              definitionMatches(action.filter!, ctx.game.definitionOf(stackCard) as DefinitionFacts),
          );
          const sources = action.topmostOnly === true ? matches.slice(-1) : matches;
          for (const stackCard of sources) {
            ctx.fx.conferStackEffects(permanentId, stackCard.instanceId, duration, {
              excludeInherited: action.excludeInherited === true,
              excludeKeywords: action.excludeKeywords,
              granterInstanceId: ctx.source.instanceId,
              ...(action.copyTrigger !== undefined ? { trigger: action.copyTrigger } : {}),
            });
          }
        }
        return false;
      }
      // Color-change grant: "change 1 of their Digimon or Tamers into a color other than white"
      // (BT18-078). The IR stores the choice domain as an object-shaped grant; resolve it into
      // the existing color-grant primitive instead of leaving it in the inert custom-grant bucket.
      if (typeof action.grant === "object" && action.grant !== null && "chooseColorOtherThan" in action.grant) {
        const grant = action.grant as { allowedColors?: string[]; chooseColorOtherThan?: string };
        const labels = (grant.allowedColors ?? ["Red", "Blue", "Yellow", "Green", "Black", "Purple"]).filter(
          (color): color is keyof typeof COLOR_MAP => color in COLOR_MAP,
        );
        if (labels.length === 0) {
          unsupported(ctx, action, "GrantStatic chooseColorOtherThan with no legal colors");
          return false;
        }
        const idx = await ctx.ask.chooseOption(ctx, labels);
        const chosen = COLOR_MAP[labels[idx] ?? labels[0]!];
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        // "Change ... into [a color]" replaces the permanent's original color for the
        // duration. It is distinct from "also treated as [color]", which is the additive
        // addColorGrant path used by ordinary color grants.
        for (const id of ids) ctx.fx.setOriginalCardInfo(id, { colors: [chosen] }, grantDuration);
        return false;
      }
      // The compiler's other encoding of the same "any color except X" choice (BT18-078):
      // { color: "otherThanWhite" } instead of { chooseColorOtherThan: "White" }. Same flow.
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        "color" in action.grant &&
        typeof (action.grant as { color?: unknown }).color === "string" &&
        (action.grant as { color: string }).color.startsWith("otherThan")
      ) {
        const excluded = (action.grant as { color: string }).color.slice("otherThan".length);
        const labels = (["Red", "Blue", "Yellow", "Green", "White", "Black", "Purple"] as const).filter(
          (color): color is keyof typeof COLOR_MAP => color !== excluded && color in COLOR_MAP,
        );
        if (labels.length === 0) {
          unsupported(ctx, action, "GrantStatic color otherThan with no legal colors");
          return false;
        }
        const idx = await ctx.ask.chooseOption(ctx, labels);
        const chosen = COLOR_MAP[labels[idx] ?? labels[0]!];
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.setOriginalCardInfo(id, { colors: [chosen] }, grantDuration);
        return false;
      }
      // { kind: "PreventSecurityActivation", cardType: "Option" } (BT1-025, BT20-015, BT20-074):
      // "this Digimon doesn't activate [Security] skills on Option cards it checks" — the exact
      // semantics `disableSecurityEffect` already exists for (KB Q886: the card still trashes).
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        (action.grant as { kind?: string }).kind === "PreventSecurityActivation"
      ) {
        const cardType = (action.grant as { cardType?: string }).cardType;
        const sourceKind = cardType === "Option" ? "option" : "any";
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const id of ids) ctx.fx.disableSecurityEffect(id, sourceKind, grantDuration);
        return false;
      }
      // { cannotBeDeletedInBattle: true } (P-098) maps directly onto the existing enforced
      // `beDeletedInBattle` restriction.
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        (action.grant as { cannotBeDeletedInBattle?: boolean }).cannotBeDeletedInBattle === true
      ) {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "beDeletedInBattle", grantDuration);
        return false;
      }
      // { keyword: "Unblockable" } (EX4-042) — same semantics as the string "unblockable" case
      // below; both map onto the existing enforced `cantBeBlocked` restriction.
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        (action.grant as { keyword?: string }).keyword === "Unblockable"
      ) {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "cantBeBlocked", grantDuration);
        return false;
      }
      // { keyword: "EndOfAttack", targetFilter: { keyword: "OnDeletion" } } (BT16-015 Phoenixmon
      // (X Antibody)): "attach [End of Attack] to all of this Digimon's [On Deletion] effects".
      // Not a keyword grant at all — a TIMING projection, so it is recorded on the continuous
      // tier and the collector re-times the target's own and inherited [On Deletion] effects into
      // the end-of-attack window (KB Q2614 reaches the inherited ones; Q2615 makes them lapse
      // with the source clause).
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        "targetFilter" in action.grant &&
        action.grant.keyword === "EndOfAttack" &&
        action.grant.targetFilter.keyword === "OnDeletion"
      ) {
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const id of ids) ctx.fx.projectOnDeletionAtEndOfAttack?.(id, grantDuration);
        return false;
      }
      // { immunity: true } (BT17-016, EX7-034) / { immuneToOpponentEffects: true } (BT20-019):
      // blanket "isn't affected by your opponent's effects" — the same unqualified `beAffected`
      // restriction the dedicated `GrantImmunity` action installs (line ~4210 below).
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        ((action.grant as { immunity?: boolean }).immunity === true ||
          (action.grant as { immuneToOpponentEffects?: boolean }).immuneToOpponentEffects === true)
      ) {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "beAffected", grantDuration, { byOpponentEffectsOnly: true });
        return false;
      }
      // { kind: "Protection", protections: [...] } (BT16-055, P-162, ST17-07) — a compound grant
      // decomposed into one `restrict()` call per named protection, each onto an ALREADY
      // enforced restriction kind. Unknown protection tokens fail loudly rather than being
      // silently dropped.
      if (
        typeof action.grant === "object" &&
        action.grant !== null &&
        (action.grant as { kind?: string }).kind === "Protection"
      ) {
        const protections = (action.grant as { protections?: string[] }).protections ?? [];
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const token of protections) {
          const mapped = PROTECTION_TOKEN_MAP[token];
          if (mapped === undefined) {
            unsupported(ctx, action, `GrantStatic Protection with unknown protection "${token}"`);
            continue;
          }
          for (const id of ids) {
            ctx.fx.restrict(id, mapped.restriction, grantDuration, {
              byOpponentEffectsOnly: mapped.byOpponentEffectsOnly,
            });
          }
        }
        return false;
      }
      // { copyEffectsFromDigivolution: { filter: "<raw printed text>" } } (BT16-062, BT22-078,
      // EX10-059) — "gains all effects of digivolution cards matching [name]/[trait]/level N".
      // The compiler captured the raw clause text instead of a structured filter; parse the
      // common "[X] in ... names"/"[X] trait"/"level N" shapes it actually uses and route
      // through the SAME `conferStackEffects` consumer the structured-filter "effects" grant
      // above uses. Unparseable text still fails loudly rather than being silently dropped.
      if (typeof action.grant === "object" && action.grant !== null && "copyEffectsFromDigivolution" in action.grant) {
        const copySpec = (
          action.grant as {
            copyEffectsFromDigivolution?: { filter?: string; trigger?: string };
          }
        ).copyEffectsFromDigivolution;
        const raw = copySpec?.filter;
        const parsedFilter = typeof raw === "string" ? parseCopyEffectsFilterText(raw) : undefined;
        if (parsedFilter === undefined) {
          unsupported(ctx, action, `GrantStatic copyEffectsFromDigivolution with unparseable filter "${raw}"`);
          return false;
        }
        for (const permanentId of ids) {
          const permanent = ctx.game.permanentById(permanentId);
          if (permanent === undefined) continue;
          for (const stackCard of permanent.stack) {
            if (stackCard.faceUp === false) continue;
            const def = ctx.game.definitionOf(stackCard);
            if (!definitionMatches(parsedFilter, def as DefinitionFacts)) continue;
            ctx.fx.conferStackEffects(permanentId, stackCard.instanceId, duration, {
              trigger: copySpec?.trigger,
              granterInstanceId: ctx.source.instanceId,
            });
          }
        }
        return false;
      }
      // Object-shaped grants that genuinely have no enforcement path yet (would need a new
      // combat/DNA-digivolve/DigiXros subsystem, not just a missing primitive wire-up). Failing
      // loudly here — instead of the old silent `grantCustom` store — surfaces them the moment
      // a game actually resolves one, matching the fail-loud shape used across this case.
      if (typeof action.grant === "object" && action.grant !== null) {
        if ("dp" in action.grant || "color" in action.grant || "originalName" in action.grant) {
          const grant = action.grant as { dp?: number; color?: string; originalName?: string };
          const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
          for (const permanentId of ids) {
            if (grant.color !== undefined || grant.originalName !== undefined) {
              ctx.fx.setOriginalCardInfo(
                permanentId,
                {
                  ...(grant.color === undefined
                    ? {}
                    : {
                        colors: [
                          COLOR_MAP[
                            Object.keys(COLOR_MAP).find(
                              (key) => key.toLowerCase() === grant.color!.toLowerCase(),
                            ) as keyof typeof COLOR_MAP
                          ],
                        ],
                      }),
                  ...(grant.originalName === undefined ? {} : { name: grant.originalName }),
                },
                grantDuration,
              );
            }
            if (grant.dp !== undefined) ctx.fx.setBaseDP(permanentId, grant.dp, grantDuration);
          }
          return false;
        }
        if ((action.grant as { kind?: string }).kind === "TreatAsLevel") {
          const grant = action.grant as { level?: number; context?: string; intoNames?: string[] };
          if (grant.context !== "DNADigivolution" || grant.level === undefined) {
            unsupported(ctx, action, "TreatAsLevel requires a DNA context and numeric level");
            return false;
          }
          for (const permanentId of ids) {
            ctx.fx.grantDnaLevel(permanentId, grant.level, {
              intoNames: grant.intoNames,
              continuous: true,
            });
          }
          return false;
        }
        const objectGrantKind =
          "kind" in action.grant ? String((action.grant as { kind: unknown }).kind) : JSON.stringify(action.grant);
        unsupported(ctx, action, `GrantStatic object grant "${objectGrantKind}" has no enforcement path yet`);
        return false;
      }
      // immuneToOpponentOptionEffects: the targeted Digimon is not affected by the opponent's
      // Option card effects for the duration. Stored as a beAffected restriction qualified to
      // Option-sourced effects; the target-resolution path excludes immune permanents when the
      // resolving card is an opponent's Option (CAP-A8, BT19-089).
      if (action.grant === "immuneToOpponentOptionEffects") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids)
          ctx.fx.restrict(id, "beAffected", grantDuration, {
            fromSourceKind: ["Option"],
            byOpponentEffectsOnly: true,
          });
        return false;
      }
      // "isn't affected by the effects of your opponent's Digimon" (BT16-063). This is narrower
      // than blanket opponent-effect immunity; opponent Option/Tamer effects are still relevant.
      if (action.grant === "immuneToOpponentDigimonEffects") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        if (action.playerWide === true && ctx.fx.restrictPlayer !== undefined) {
          const filter = action.target.filter;
          for (const seat of seatsForController(ctx, filter)) {
            ctx.fx.restrictPlayer(
              seat,
              "beAffected",
              grantDuration,
              createTrackedPermanentFilterMatch({ ctx, filter, sourceKinds: undefined }),
              {
                sourceCardId: ctx.source.definition.cardId,
                effectText: getFieldEffectText({ action, ctx }),
                fromSourceKind: ["Digimon"],
                byOpponentEffectsOnly: true,
              },
            );
          }
          return false;
        }
        for (const id of ids)
          ctx.fx.restrict(id, "beAffected", grantDuration, {
            fromSourceKind: ["Digimon"],
            byOpponentEffectsOnly: true,
          });
        return false;
      }
      // "immuneToOpponentEffects" (BT20-019 stringly, LM-020) — blanket opponent-effect immunity.
      if (action.grant === "immuneToOpponentEffects") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "beAffected", grantDuration, { byOpponentEffectsOnly: true });
        return false;
      }
      // "attackImmunity" (BT5-030, P-051): "This Digimon can't be attacked" — the already
      // enforced `cantBeAttacked` restriction.
      if (action.grant === "attackImmunity") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "cantBeAttacked", grantDuration);
        return false;
      }
      // "unblockable" (BT4-035, ST8-09): the already enforced `cantBeBlocked` restriction.
      if (action.grant === "unblockable") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "cantBeBlocked", grantDuration);
        return false;
      }
      // "dpReductionImmunity" (BT11-069): "can't have its DP reduced by your opponent's
      // effects" — dpImmune scoped to the opponent. An optional "DeDigivolveImmunity" token
      // layers on the (unscoped, per the printed "isn't affected by <De-Digivolve> effects")
      // cantBeDeDigivolved restriction, same as the equivalent Protection.protections entry.
      if (action.grant === "dpReductionImmunity") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "dpImmune", grantDuration, { byOpponentEffectsOnly: true });
        if ((action.tokens ?? []).includes("DeDigivolveImmunity")) {
          for (const id of ids) ctx.fx.restrict(id, "cantBeDeDigivolved", grantDuration);
        }
        return false;
      }
      // "immuneToOpponentDPReductionAndReturn" (BT10-068, BT22-059): "your opponent's effects
      // can't reduce this Digimon's DP or return it to hands or decks" — dpImmune + beReturned,
      // both scoped to the opponent.
      if (action.grant === "immuneToOpponentDPReductionAndReturn") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        if (action.playerWide === true && ctx.fx.restrictPlayer !== undefined) {
          const filter = action.target.filter;
          const matches = (permanentId: string): boolean => {
            const permanent = ctx.game.permanentById(permanentId);
            return permanent !== undefined && permanentMatchesFilter(ctx, permanent, filter, ctx.source);
          };
          for (const seat of seatsForController(ctx, filter)) {
            ctx.fx.restrictPlayer(seat, "dpImmune", grantDuration, matches, {
              sourceCardId: ctx.source.definition.cardId,
              effectText: getFieldEffectText({ action, ctx }),
              byOpponentEffectsOnly: true,
            });
            ctx.fx.restrictPlayer(seat, "beReturned", grantDuration, matches, {
              sourceCardId: ctx.source.definition.cardId,
              effectText: getFieldEffectText({ action, ctx }),
              byOpponentEffectsOnly: true,
            });
          }
          return false;
        }
        for (const id of ids) {
          ctx.fx.restrict(id, "dpImmune", grantDuration, { byOpponentEffectsOnly: true });
          ctx.fx.restrict(id, "beReturned", grantDuration, { byOpponentEffectsOnly: true });
        }
        return false;
      }
      // "cantLeaveExceptByOwnerOrDeletion" (BT16-051): "can't leave the battle area other than
      // by deletion" — one unscoped restriction consumed by every non-deletion whole-permanent
      // movement seam (Q2642: hand/deck, security, and placement under another permanent).
      if (action.grant === "cantLeaveExceptByOwnerOrDeletion") {
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const id of ids) ctx.fx.restrict(id, "leaveBattleAreaExceptByDeletion", grantDuration);
        return false;
      }
      // "canBeAttackedWhileUnsuspended" (BT21-096) — the compiler's alternate label for the SAME
      // "may also attack unsuspended Digimon" grant the dedicated `GrantCanAttackUnsuspended`
      // action installs via `grantCanAttackUnsuspended`.
      if (action.grant === "canBeAttackedWhileUnsuspended") {
        const grantDuration = toDuration(action.duration ?? "forTheTurn");
        for (const id of ids) ctx.fx.grantCanAttackUnsuspended(id, grantDuration, {});
        return false;
      }
      // "addName" (P-072, P-073): "treat this card/Digimon as if its name is also [X]" — the
      // same alias mechanism the dedicated "name" grant above uses.
      if (action.grant === "addName") {
        const tokens = action.tokens ?? [];
        if (tokens.length === 0) {
          unsupported(ctx, action, "GrantStatic addName with no tokens");
          return false;
        }
        for (const id of ids) ctx.fx.grantNameTrait(id, "name", tokens, duration);
        return false;
      }
      // "noSecurityOptionEffects" (BT17-014, BT7-014, ST13-05): the printed [Security] text on
      // Option cards the source Digimon checks doesn't activate — the same WarGreymon-shaped
      // ability `disableSecurityEffect` was built for.
      if (action.grant === "noSecurityOptionEffects") {
        const grantDuration = toDuration(action.duration ?? "permanent");
        for (const id of ids) ctx.fx.disableSecurityEffect(id, "option", grantDuration);
        return false;
      }
      // "suppressOnPlayEffects" (BT10-083, EX5-060): "[On Play] effects on Digimon played by
      // this effect don't activate" — the target the compiler emits is `isSelfRef` (the SOURCE
      // card), but the ability's actual subject is the permanent the PRECEDING PlayWithoutCost
      // action just played (the DelayedDelete action a few cases up resolves the identical
      // "the permanent this effect just played" reference the same way).
      if (action.grant === "suppressOnPlayEffects") {
        const grantDuration = toDuration(action.duration ?? "permanent");
        for (const id of ctx.lastPlayedPermanentIds ?? []) {
          ctx.fx.disableTimingEffect(id, ["onPlay"], grantDuration);
        }
        return false;
      }
      if (action.grant === "hasAllDigivolutionColors") {
        const grantDuration = toDuration(action.duration ?? "permanent");
        for (const id of ids) {
          const permanent = ctx.game.permanentById(id);
          if (permanent === undefined) continue;
          const colors = new Set<CardColor>();
          for (const card of permanent.stack) {
            if (card.faceUp !== true) continue;
            for (const color of ctx.game.definitionOf(card).colors) colors.add(color);
          }
          for (const color of colors) ctx.fx.addColorGrant(id, color, grantDuration);
        }
        return false;
      }
      // "protection" (BT24-055, EX7-041, ST13-14) — the string-grant sibling of the object-shaped
      // Protection above, using its own (opponent-scoped) token vocabulary.
      if (action.grant === "protection") {
        const tokens = action.tokens ?? [];
        const grantDuration = toDuration(action.duration ?? "untilOpponentTurnEnd");
        for (const token of tokens) {
          const mapped = PROTECTION_STRING_TOKEN_MAP[token];
          if (mapped === undefined) {
            unsupported(ctx, action, `GrantStatic protection with unknown token "${token}"`);
            continue;
          }
          for (const id of ids) ctx.fx.restrict(id, mapped, grantDuration, { byOpponentEffectsOnly: true });
        }
        return false;
      }
      // BT18-065: while the controller has no Digimon other than Vemmon,
      // cards in that controller's trash are legal DigiXros materials. This
      // uses the same per-seat expansion ledger as the Tamer expander cards;
      // the enclosing static condition is re-evaluated on every recompute.
      if (action.grant === "digixrosFromTrash") {
        const grantDuration = toDuration(action.duration ?? "permanent");
        // The printed clause is about "THIS CARD's DigiXros", and a DigiXros is declared from the
        // HAND. An off-field source resolves no permanent target, so scope the grant to this very
        // card's pending play instead of the whole seat: the direct DigiXros verb and the
        // effect-driven play path both read it back keyed by the played instance (BT17-057 Q2811).
        if (ids.length === 0 && ctx.source.permanent() === undefined) {
          ctx.fx.expandDigiXrosZonesForPlay?.(ctx.source.ownerSeat, ["trash"], grantDuration, ctx.source.instanceId);
          return false;
        }
        for (const id of ids) {
          const permanent = ctx.game.permanentById(id);
          if (permanent === undefined) continue;
          ctx.fx.expandDigiXrosZones?.(permanent.controllerSeat, ["trash"], grantDuration);
        }
        return false;
      }
      // String grants with no enforcement path yet (would need a new subsystem — DNA-digivolve
      // level overrides, attacking a Digimon directly, DigiXros-from-trash, an alternate-color
      // rules layer, etc.), not just a missing primitive wire-up. Failing loudly here — instead
      // of the old silent `grantCustom` store — surfaces them the moment a game actually
      // resolves one.
      if (typeof action.grant === "string") {
        unsupported(ctx, action, `GrantStatic string grant "${action.grant}" has no enforcement path yet`);
        return false;
      }
      // "gains all effects of cards with [X] in its/your digivolution cards" —
      // register stack-card effect conferrals on the continuous ledger (recomputed
      // each static pass; collected at every triggered timing).
      if (!action.filter) {
        unsupported(ctx, action, "GrantStatic effects with no source filter");
        return false;
      }
      for (const permanentId of ids) {
        const permanent = ctx.game.permanentById(permanentId);
        if (permanent === undefined) continue;
        for (const stackCard of permanent.stack) {
          if (stackCard.faceUp === false) continue;
          const def = ctx.game.definitionOf(stackCard);
          if (!definitionMatches(action.filter, def as DefinitionFacts)) continue;
          ctx.fx.conferStackEffects(permanentId, stackCard.instanceId, duration, {
            excludeInherited: action.excludeInherited === true,
            granterInstanceId: ctx.source.instanceId,
          });
        }
      }
      return false;
    }
    default:
      // Unreachable: runAction routes only this family's kinds here, and its own default
      // reports anything the Action union does not cover.
      return false;
  }
}
