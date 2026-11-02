---
name: verify-card-implementation
description: Audit and correct one Digimon Card Game implementation using the committed card catalog, rules knowledge base, direct TypeScript module, and behavioral tests. Use when implementing a card, reviewing card fidelity, investigating a card-specific rules gap, or proving that a card issue is complete.
---

# Verify Card Implementation

Work on one card ID at a time. Treat printed behavior as the contract and
observable game state as proof.

## 1. Establish the evidence

1. Find the exact card ID in `packages/shared/src/cards/data/cards.json`.
2. Read every applicable field, including alternate evolution requirements,
   main text, inherited text, Security text, traits, colors, costs, and limits.
3. Query the local knowledge base:

   ```bash
   node tools/kb/query.mjs card <CARD-ID>
   ```

4. Read relevant comprehensive rules, rulings, errata, and restrictions from
   `data/kb` when the card query exposes them.
5. Record any unresolved ambiguity instead of inventing behavior.

Completion criterion: every printed clause has a locally identifiable source,
and any ambiguity is explicit.

## 2. Trace the implementation

Inspect the direct module and colocated test:

```text
apps/api/src/cards/<SET>/<CARD-ID>.ts
apps/api/src/cards/<SET>/<CARD-ID>.test.ts
```

Map each clause to executable behavior. Check:

- trigger timing, optionality, and once-per-turn identity;
- targets, controller, count, filters, and exact boundaries;
- costs, choices, failure paths, and conditional results;
- source and destination zones, order, visibility, and face state;
- duration, turn ownership, inherited effects, and Security effects;
- interactions with deletion, battle, attacks, evolution, and pending decisions.

Follow every shared primitive used by the module far enough to verify its real
semantics. When the engine cannot express the card faithfully, improve the
smallest reusable engine seam before implementing the card, and document that
seam in `docs/audits/engine/<seam>.md` (kebab-case).

Registration rules from [cards and rules](../../../internal-docs/ai/cards-and-rules.md):

- The module registers behaviour exclusively with
  `registerIrCard(cardId, compiled)`. Never add or keep a second
  `registerCard` registration for the same card; a handwritten card is ported
  to compiled IR or recorded as an open item below 10/10.
- No `// @ts-nocheck`, casts, suppressions or weakened printed requirements.
- `coverage: "full"` and `residual: []` are the target. A clause the engine
  cannot express stays as an `it.fails` test naming the seam.

Completion criterion: every clause maps to concrete code, with no silent gap or
approximation.

## 3. Build behavioral proof

Create or strengthen the colocated test. Follow current neighboring card tests
and use public intents, `settle()`, and assertions on observable `GameState`.

Cover the smallest set of cases that proves the complete contract:

- the card-specific positive path;
- exact target and numeric boundaries;
- a meaningful negative path;
- optional refusal when the text says “may”;
- paid costs and final zones;
- duration, inherited behavior, Security behavior, and once-per-turn limits
  when applicable.

Use neutral fixtures whose own effects cannot open decisions or alter the
result. Resolve the full effect stack before final assertions.

Completion criterion: reverting the card-specific implementation makes at
least one focused assertion fail for the intended reason.

## 4. Cross-card and evolution-stack verification

Check the card against nearby implementations that share its traits, colors,
evolution requirements, or effect vocabulary. Read those peer modules and
tests to detect inconsistent targeting, timing, cost handling, inherited
effects, and trait filters. Add at least one comparative case when a peer
interaction is relevant (for example, a trait-based effect selecting this
card and a similar card).

When the card uses a trait or trait-based filter, assemble a focused test deck
or board containing multiple cards with that trait, cards with near-matching
traits, and at least one non-matching card. Exercise searches, buffs, deletion,
evolution, and target selection against that mixed pool so the implementation
is proven to distinguish the complete trait set rather than succeeding only
with a single-card fixture.

Exercise the card in realistic evolution stacks, not only as an isolated card:

- build the smallest legal stack that reaches the card and verify each
  evolution requirement and source-card transition;
- assert inherited effects from the stack and confirm the correct source,
  level, traits, colors, and DP are visible after each evolution;
- build stacks from the focused trait deck, including a similar-trait card and
  one invalid or non-matching stack, to prove filters and boundaries;
- when applicable, resolve effects across multiple evolution steps, deletion,
  unsuspension, attacks, and security so pending effects do not lose their
  source or controller.

Use the Orca Browser or an equivalent observable UI harness for the stack
scenarios when the application exposes the relevant flow. A passing isolated
fixture is not sufficient evidence for a card whose behavior depends on
traits or evolution sources.

Completion criterion: every applicable shared-trait and evolution-stack risk
has a passing comparative or stack assertion, or is explicitly documented as
unsupported or ambiguous.

## 5. Verify the change

Run the focused test first:

```bash
pnpm --filter @aegis/api exec vitest run src/cards/<SET>/<CARD-ID>.test.ts --maxWorkers=1 --no-file-parallelism
```

Then run tests for every shared engine seam changed, followed by:

```bash
pnpm typecheck
pnpm exec oxlint <changed files>; pnpm exec oxfmt --check <changed files>
git diff --check
```

Always pass `--maxWorkers=1 --no-file-parallelism`; each vitest process with
the API graph takes about 1.5 GB, and parallel lanes share the machine.

Run broader card or engine suites when the implementation changes shared
targeting, timing, zones, combat, decisions, or effect resolution.

Completion criterion: focused proof, affected regression suites, typecheck,
and diff validation all pass, or each unrelated pre-existing failure is named
with evidence.

## 6. Close the audit

Report:

- the card ID and clauses verified;
- implementation and reusable engine changes;
- focused and regression tests executed;
- remaining ambiguity or unsupported behavior;
- the commit that delivers the verified result, when delivery was requested.

If a matching repository issue exists, append the evidence there and close it
only after the verified change is delivered. Never treat file presence alone as
proof that a card is complete.
