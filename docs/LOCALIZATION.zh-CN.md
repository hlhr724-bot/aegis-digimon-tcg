# Simplified Chinese card translations

The web client loads card translation data only for `zh-CN`. Names, metadata and
keyword reminders load separately from the larger printed-text dictionary, which
is requested only by effect-text displays. It uses the
upstream locale context; Traditional Chinese and other locales retain their
existing card display. A failed load or a missing entry falls back to the original
English card name, printed text or keyword reminder.

The dictionaries are presentation data. Shared card definitions, server effects,
card IDs, deck serialization and the rules engine retain their original values.
Translated strings are rendered as React text, not injected HTML.

## Data files

- `cardNames.zh.json`: English card names mapped to Simplified Chinese.
- `cardText.zh.json`: normalized complete English printed text mapped to Chinese.
- `cardKeywords.zh.json`: keyword labels.
- `keywordReminders.zh.json`: keyword labels and reminder explanations keyed by
  the existing upstream glossary identifiers.
- `cardMeta.zh.json`: forms, attributes and traits used in card details.

The data comes from the contributor's maintained Chinese translation dictionaries.
This change does not add artwork or modify the upstream card catalog. The existing
project ownership and licensing notices continue to apply to card content.

## Display and fallback

Card images retain their original artwork. The surrounding name, accessibility
label, board token caption, deck preview, card link, full effect text and keyword
hint use available translations. The rule links retain their upstream targets.

Printed text keys ignore formatting whitespace, normalize full-width keyword
brackets, and decode common HTML entities. Chinese timing and keyword brackets are
converted to the notation recognized by the upstream effect renderer. Exact
complete-text entries take priority. When a complete field has no match, each
nonempty line is matched independently against complete dictionary entries.
Unmatched lines remain in English, with their original line breaks and spacing.
For resolving clauses, effect displays pass the source card ID. If an exact
entry is unavailable, the client searches only that card's complete text boxes
and matches complete clauses using recognized Chinese timing headers, usage
limits and the leading Delay keyword. The sets of recognized clause signatures
must agree across the complete source and translated text boxes. A signature
must occur exactly once in each box, and the requested text must match a complete
source paragraph. Paragraph position and total paragraph count do not establish
alignment: Assembly conditions and standalone keywords can move between printings.
Continuation lines, including Delay bullets, remain attached to their clause.
Exact full-field and clause entries still take priority. Missing context, unknown
headers, repeated signatures, incompatible structures, conflicting text-box
matches and partial sentences retain the existing fallback. Regional dictionaries
continue to use their exact entries; no catalog-wide substring search or sentence
translation is performed.

Run `pnpm translations:audit` to write `.local/card-translation-coverage.json`.
The report includes card IDs, fields, original text and unmatched effect lines.
`pnpm translations:check` fails when names, effects or metadata are missing or
empty. The normal web build runs this check before compilation, including the
Docker web build used by self-hosted deployments. Custom direct Vite builds must
run the check separately. Coverage measures dictionary availability, not semantic
translation accuracy. A complete-field match does not prove that every sliced
notice or decision clause can be translated. Resolving-clause component tests
cover these display paths separately; the catalog audit does not certify them.

Dictionary maintenance should preserve English keys and named placeholders. After
changing data or integration code, run the locale tests, card display tests,
keyword reminder tests, type checking, style checks and a production web build
against the intended upstream revision.

## Historical source verification

The earlier bilingual [source and rights-holder verification note](provenance/SOURCE-PROVENANCE.zh-en.md)
is included for review. It records an investigation of a proposed official source;
its links and findings were not independently reverified for this contribution.
It is not a per-entry provenance audit of the bundled maintained dictionaries,
and it does not establish redistribution authorization.

## Keyword parameters and metadata domains

Parameterized keywords retain their original conditions and card names. The
client translates their base keyword, not an incomplete substring from a
parameterized label dictionary. Signed Security Attack modifiers are retained in
both the badge label and its explanation. Printed Chinese labels resolve back
to the upstream keyword rule before building a rule link.

Forms, attributes and traits are separate lookup domains; a term appearing in
more than one domain may legitimately have different translations. Explicit card
link labels supplied by callers retain their wording.

## Measured coverage and limits

At upstream `6195fad386ec`, the maintained name dictionary matches 4,479 of 4,481
card records. Exact full-field lookup matches 3,828/3,867 main effects,
1,994/1,997 inherited effects, 833/840 security effects, 20/23 option effects,
and 77/77 link effects. These counts measure lookup coverage, not semantic
translation accuracy. Missing names or effects retain English. The dictionaries
may also contain maintained entries for content outside the current catalog.

This change does not add Chinese search indexing, arbitrary server-prose
translation, or heuristic partial-clause matching. The bilingual source note is
historical supporting material; it does not prove the origin of every entry or
redistribution authorization. Native-speaker review remains useful for data
accuracy even when type, schema and runtime checks pass.
