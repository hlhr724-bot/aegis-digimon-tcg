---
name: coding-style
description: Apply Aegis TypeScript conventions when writing, refactoring, or reviewing application code, including domain folders, helper boundaries, server authority, and validation.
---

# Coding style

Use the Node and pnpm versions in root `package.json`. Keep TypeScript, React, Vite,
Colyseus, and PostgreSQL; application modules use ESM.

## Functions and files

- Do not add comments under any circumstances: no inline, block, JSDoc, JSX, lint
  suppression, or commented-out code. Express intent through names, types, and small
  functions; put explanations in the PR description or your report.
- Each exported helper lives in its own file, named after the helper. Only a helper
  private to a module may stay in that module. Do not export an internal helper just
  to test it; exercise its observable caller instead.
- Use named functions and a single typed object argument for new helpers with multiple
  inputs. Preserve positional signatures required by frameworks, callbacks, and
  existing public contracts until their callers are deliberately migrated.
- Prefer pure calculations and immutable inputs. State mutation belongs in the
  authoritative engine or persistence owner; do not rewrite those mechanisms just to
  imitate immutability.
- Delete unused code and imports. Do not leave debugging or commented-out alternatives.

## Domain organization

- Keep `apps/api`, `apps/web`, and `packages/shared` as the workspace boundaries.
  Both apps depend on shared contracts; neither imports the other app.
- Group files by product domain, then by responsibility when a domain becomes large.
  Avoid generic dumping grounds such as `helpers.ts`, `utils.ts`, or `misc/`.
- Colocate tests, domain types, enums, and helpers with their owner. Do not create
  `index` files or barrels; import each symbol from its owning file.
- Keep card modules in `apps/api/src/cards/<SET>/`; game scenario regressions stay in
  `apps/api/src/engine/scenarios/`. These layouts are tooling contracts.
- Use aliases instead of relative imports: `@/<domain>/<file>` in web,
  `#api/<domain>/<file>` in API, and `#shared/<domain>/<file>` inside shared. Across
  workspaces, use `@aegis/shared/<domain>/<file>` directly. Do not import a package
  root that resolves to a barrel. Node package maps resolve extensionless aliases to
  emitted `.js` in production and `.ts` under the development condition for tests.

## Runtime and persistence

The API authenticates the actor, validates input, authorizes access, and performs the
mutation. Routes and room handlers delegate to domain owners. Derive identity from
the authenticated session or room seat, never a client-supplied account identifier.

The client presents synchronized state and sends intents. Shared code contains
contracts, schemas, enum definitions, and pure calculations; no database access or
authoritative game mutations. Keep SQL in API stores, parameterize values, await
asynchronous writes, and use transactions for coupled changes. Append migrations;
do not rewrite released migration bodies. Update `COLLECTIONS.md` with schema changes.

Use static imports for ordinary dependencies. Dynamic imports require an actual
lazy-loading or runtime boundary. Retain classes required by Colyseus schemas,
rooms, or existing stateful domain owners.

For fixed domain values, read [enums](../enums/SKILL.md). Before completion, use
[quality-gate](../quality-gate/SKILL.md). Card and replay work also follows the
specialized skills linked from root `AGENTS.md`.
