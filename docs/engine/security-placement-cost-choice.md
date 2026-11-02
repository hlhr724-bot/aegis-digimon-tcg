---
title: Security placement processing cost choice
updated: 2026-09-12
---

# Security placement processing cost choice

The permanent-target placement processing cost ignored `position: "choice"` and always placed at the top. Commit `dca801c22` asks for top or bottom before moving the exact permanent top card through the existing Security seam. Explicit top and bottom positions retain their existing behavior.

P187 public DNA tests reproduce both choices, the card-owner Security destination, original material/source dispositions, and optional cost refusal. The focused suite passes 5 tests. The coordinator independently passed 138 enumerated mechanism files (2074 tests) plus the top-level combat battle file (5 tests), totaling 139 files and 2079 tests. API typecheck, focused Oxfmt/Oxlint, and diff checks pass. Printed recovery and card-specific DNA evidence remain in [the P collection ledger](../P.md).

## One material per distinct name

EX10-061's self-placement reducer uses the shared `pickLoose` selector. A mandatory
`count: "all", distinctNames: true` selection means one card from every available
name group, not one card per physical candidate. With two MetalSeadramon and one
Puppetmon, it asks which MetalSeadramon to use, places two cards, and reduces the
play cost by eight. The duplicate remains in security.

The printed EX10-061 contract is in the committed card catalog; KB Q5783/Q5784
requires every available distinct name when the reduction is accepted. Q5785/Q5786
applies the same rule to playing its sources. The existing EX10-061 tests cover
single-name and duplicate-name payments, refusal, the resulting cost, and the
cards played from sources. The Apocalymon/Kari scenario covers the security-removal
watcher after payment. The card IR and effect snapshot are unchanged.
