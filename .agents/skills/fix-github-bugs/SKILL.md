---
name: fix-github-bugs
description: Investigate and fix open Aegis GitHub bug reports in a new worktree, using private feedback evidence, exact replays and guarded Oracle VPS diagnostics. Use for a GitHub bug sweep or a specific GitHub bug; route release and feedback closure to aegis-release-feedback-closeout.
---

# Fix GitHub bugs

Read repository instructions and the development, replay and testing guidance. List open issues with `gh issue list --state open --limit 100 --json number,title,labels,body,url`; paginate when necessary. Read each bug's full body, comments and attachments with `gh issue view`. Exclude feature and card-set trackers from a bug sweep. Identify duplicate symptoms without assuming identical causes.

Create a fresh `fix/` worktree from current `origin/develop`, preserving existing checkouts. Use the public Orca CLI when the repository is Orca-managed. Use the Node and pnpm versions in `package.json`, install with the frozen lockfile, build shared contracts, and start with `pnpm dev`. Restart compiled API processes after API changes.

## Recover evidence

Match GitHub references to `feedback_reports` through the authorized admin interface or a bounded read-only database query. Read `docs/FEEDBACK.md` and `COLLECTIONS.md` for current fields. Public issues can omit private diagnostic context and replay references. Retrieve only the rows and diagnostic fields needed; keep secrets out of output and private evidence in ignored `.local/` or `replays/`.

For any replay or match ID, follow [replay guidance](../../../internal-docs/ai/replays.md) before constructing a synthetic reproduction. Resolve earlier divergence before relying on the result. If exact evidence is unavailable, say so and distinguish a synthetic regression from reproduction of the original match.

The user may authorize the configured Oracle SSH alias for investigation. Read the remote host's `AGENTS.md` first. Run every ad-hoc log read or analysis through `aegis-safe`, narrow by time and match/error ID, stream bounded results, and run one heavy command at a time. Do not bypass resource guards, restart containers, or modify production as part of an investigation.

## Correct and prove

Use `verify-card-implementation` for card/rules defects and `fix-discord-bug` when evidence originates in Discord. Check printed text and official rulings. Build a behavior-named regression that fails on the reported symptom before fixing the authoritative product code. Resolve all decisions and assert final zones, costs and turn progression. Sweep callers/cards sharing the faulty mechanism and distinguish same-root defects from unrelated findings.

Apply `coding-style`, `enums` when relevant, and `quality-gate`. Synchronize changed card IR snapshots. Run API suites with one worker and no file parallelism. Run relevant regressions, type checking, the full style gate and `git diff --check`; report baseline failures and unrun checks accurately.

For connection incidents, correlate the report's timestamp, client/server revisions and private diagnostic IDs with bounded server evidence. A current healthy endpoint does not disprove an earlier interruption. Keep an incident unconfirmed when no reliable reproduction or root cause exists.

## Delivery and closure

Report every in-scope issue separately with evidence, root cause or uncertainty, fix, tests and delivery state. Keep local corrections distinct from deployed repairs. Do not infer authorization to publish, deploy, message players or close reports from a request to investigate and fix locally.

For authorized release and closure, continue with the installed `aegis-release-feedback-closeout` skill. Pass issue numbers, feedback IDs, regression commands and verified findings without exposing private records. That workflow verifies deployment, localized feedback replies, idempotent confirmed-bug points and independent GitHub closure. Leave reports open until the authorized delivery and closure conditions are met.
