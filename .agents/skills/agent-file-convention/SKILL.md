---
name: agent-file-convention
description: Maintain Aegis agent instructions with a short canonical AGENTS.md, a thin CLAUDE.md pointer, topic guidance in internal-docs/ai, and a PostgreSQL data inventory.
---

# Agent instruction files

| Purpose                                                      | Canonical location                        |
| ------------------------------------------------------------ | ----------------------------------------- |
| Rules needed on most tasks and links to specialized guidance | Root `AGENTS.md`                          |
| Claude compatibility                                         | `CLAUDE.md`, containing only `@AGENTS.md` |
| Detailed commands, workflows, and architecture guidance      | `internal-docs/ai/*.md`                   |
| Persistent data inventory                                    | Root `COLLECTIONS.md`                     |
| Discoverable repository workflows                            | `.agents/skills/<name>/SKILL.md`          |

Keep `AGENTS.md` short. Move task-specific examples to the relevant topic document
and link it with a clear reading condition. Preserve card rules, replay
reproduction, conformance citations, and browser synchronization requirements when
moving guidance. Keep architecture documentation in `docs/ARCHITECTURE.md` as the
product architecture source; internal guidance should link it.

Do not duplicate rules in tool-specific files. A skill owns its workflow; root
instructions route to it. Keep every helper in its own file unless private to its
caller, and prohibit new code comments in root instructions and the coding skill.
Require direct imports through configured aliases, with no new `index` files or
barrels. Preserve legacy runtime initialization while migrating existing consumers.

`COLLECTIONS.md` inventories PostgreSQL tables, key fields, constraints, indexes,
and their migration/store owners. Its name is a documentation convention, not a
request to introduce MongoDB. Include non-durable game state and replay file
storage boundaries so readers do not confuse them with database tables.

Verify paths and commands against the repository. Update implementation and
guidance together when they diverge. Do not add credentials, tokens, personal data,
private infrastructure locations, or deployment-specific values. Do not create or
edit Markdown files unless requested, including task-specific planning documents.
