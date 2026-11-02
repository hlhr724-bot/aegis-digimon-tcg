# Card-effect display translations

Chinese printed text is resolved by exact card-specific or shared dictionary entries first. Clause lookup preserves timing and usage-limit signatures, modal option counts and source-field identity. Unknown rules retain their source text.

`resolveCardText` reports complete, partial, missing, pending or error results. Loading errors remain observable and retryable, and stale language responses are discarded. Display diagnostics are bounded in memory; they are not sent to a server.

## Authored step context

A short runtime hint can omit the conditions and targets needed to translate it independently. Notices, folded narration and decisions pass their source card, field and timing into the same resolver. Where a hint has no independent translation, an authored-context fallback can show its complete translated effect passage.

The fallback requires all of the following:

- The exact hint exists as effectTextPart or effectTextEmphasis in that card's compiled actions at the supplied timing.
- The printed field agrees with the compiled inherited, linked, security or option provenance and any supplied field.
- The fragment has complete word boundaries in exactly one printed passage for that field and timing. Sentence-initial capitalization and encoded spaces may be normalized; numeric conditions and other words are not rewritten.
- Modal bullets are considered individually. A hint shared by multiple possible passages is rejected rather than selecting the first option.
- The selected complete passage resolves fully through the existing translation dictionary and clause checks.

Hints absent from compiled actions, mismatched timings or fields, changed counts, missing translations and repeated contexts remain incomplete. The general substring fallback retains its stricter sentence boundary and minimum-length requirements; authored hints do not relax arbitrary-prose matching.

The version-bound entry for BT3-093 handles a malformed `On Play]` header in the historical catalog. Its card field and exact source version must match, and it applies only at OnPlay. The complete Chinese On Play paragraph is reused from the existing full-card translation in cardText.runtime.zh.json. The Start of Your Turn paragraph is excluded. Changes to the printed source invalidate this exception. This does not modify card definitions or executable rules.

## Validation

Use the Node and pnpm versions in package.json. Build shared contracts before web tests.

```sh
pnpm translations:check
pnpm translations:fragments
pnpm --filter @aegis/web exec vitest run src/i18n/authoredCardContext.test.ts src/i18n/resolveCardText.test.ts src/i18n/runtimeRulePrompts.test.ts src/i18n/useCardTranslationState.test.tsx src/game/NoticeStack.test.tsx src/game/decisionOverlay.test.tsx
```

The fragment audit enumerates complete fields, printed clauses, notices, modal preambles/bullets and compiled runtime hints. Displayed-step identity includes timing, so the same wording in Main and Security is tested separately. Raw hints are reported separately from the passages that the UI actually displays. A passing dictionary-availability audit alone is not sufficient display coverage or a semantic review of translations.

runtimeRulePrompts.test.ts checks reviewed mechanism strings and templates against engine sources. A change to a template expression requires reviewing runtime-rule-template-sources.json and translation behavior together. This contract is not a generic translator for future prose or arbitrary DigiXros summaries.

Keep screenshots and local capture fixtures in ignored .local directories. PRs should contain only portable display code, dictionaries, behavior tests and these contracts; exclude self-hosted release configuration and operations evidence.
