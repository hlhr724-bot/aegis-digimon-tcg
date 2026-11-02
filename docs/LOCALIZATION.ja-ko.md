# Japanese and Korean printed card text

Card details resolve printed text using the selected card face language. The surrounding application retains the player's interface language. English remains the fallback when no matching translation exists. These dictionaries do not alter the authoritative English catalog or executable card behavior.

The importer uses the official [Japanese card catalog](https://digimoncard.com/cards/) and [Korean card catalog](https://digimoncard.co.kr/index.php?mid=cardlist). The October 16, 2026 snapshot contains 78 Japanese product categories and 292 Korean pages.

| Language | Cards with source printings | Cards with translated effects | Translated effect fields | Unavailable or conflicting fields |
| -------- | --------------------------: | ----------------------------: | -----------------------: | --------------------------------: |
| Japanese |                       4,474 |                         4,288 |                    6,762 |                                54 |
| Korean   |                       3,814 |                         3,594 |                    5,485 |                             1,331 |

Coverage is against 4,487 catalog cards and counts direct per-card mappings, before runtime reuse of identical English text. Some cards have no effects. The Korean publication catalog does not yet contain every Japanese release. Japanese gaps include English-only name-disambiguation rules and unreleased printings. Conflicting source fields are withheld (3 Japanese, 56 Korean).

## Refresh

Run with the repository's Node version, from the root:

```sh
node tools/translations/fetch-official-card-sources.mjs
node tools/translations/import-official-card-translations.mjs
node --test tools/translations/*.test.mjs
pnpm --filter @aegis/web test src/i18n/cardTranslations.test.ts src/i18n/regionalCardTranslations.test.ts
```

Raw HTML is cached under ignored `.local/card-language/sources`. To fetch a fresh snapshot, pass a new directory to both scripts. The importer requires all manifest pages before writing dictionaries. Commit the generated dictionaries and `tools/translations/official-card-text.{ja,ko}.json` reports together. Reports retain each translated field's source URL and enumerate missing or conflicting fields; coverage tests require new catalog effects to have a mapping or an explicit gap.

Japanese source sections are mapped separately to main, inherited, security, dual-option, and Link fields. Special evolution, special play and rule sections join the main effect. Korean pages expose upper and lower text boxes; the lower box is mapped only when the canonical card has one lower effect type. Ambiguous Korean dual cards and multiple lower effect types remain untranslated. Standard printings take precedence over alternate artwork. Conflicting standard printings are not resolved automatically.

Per-card dictionaries retain differing official wording for the same English text. A global exact-text dictionary includes only unambiguous wording. Runtime resolution follows the Chinese implementation from PR #5607: complete text first, matching complete clauses where paragraph boundaries agree, then complete lines. Partial sentences are never translated by substring substitution. Brackets are normalized for existing effect highlighting. Names and unambiguous metadata also use official source data; Japanese and Korean keyword reminder dictionaries are not provided.

Source consistency checks do not constitute a manual linguistic review of every card. Missing fields retain English; a card can therefore contain a mixture when only some of its effect boxes have official translations.
