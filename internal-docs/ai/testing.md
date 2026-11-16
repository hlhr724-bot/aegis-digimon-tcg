# Testing

- Put game scenarios and bug regressions in `apps/api/src/engine/scenarios/<behavior>.test.ts`, card tests in `apps/api/src/cards/<SET>/`, and mechanism tests beside their implementation. Name files and suites after behavior; keep external IDs out of scenario identities and necessary provenance in the PR description. Do not add code comments.
- Share reusable preparation in `<behavior>.fixture.ts` through `engine/scenario` and `setupScenario` from `engine/testkit`; E2E uses `ScenarioPage.openFixture`. Resolve card identities through aliases and keep assertions and actions in each runner. See [regression fixtures](../../docs/TESTING.md).
- Fixtures need no arena registration. Open one with `pnpm scenario open <behavior>` or an ignored `.local/scenarios/<name>.fixture.ts`; add a permanent demo only when requested.
- Reuse `engine/testkit`; exercise public intents and assert costs, card identities, destinations, effect order, and turn progression, including relevant refusal or illegal-action branches.
- Run focused tests, then affected suites. For controlled API runs:

  ```sh
  pnpm --filter @aegis/api exec vitest run src/engine/scenarios/<behavior>.test.ts --pool=forks --maxWorkers=1 --no-file-parallelism
  ```

- Put browser specs in `apps/web/e2e/` using the real GameScreen and Colyseus harness. Run one Playwright instance at a time:

  ```sh
  NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @aegis/web test:browser <spec>.spec.ts
  ```

- Never use `waitForTimeout` or fixed sleeps for E2E synchronization. Wait for visible controls, decisions, state transitions, and queue completion. See [E2E setup](../../apps/web/e2e/README.md).
- Reuse `scenario-page.ts` to check decision visibility, draw/zone presentation, and effect resettling. Assert that the queue drains without failures or expired gates; exclude human response time. Document timing exceptions per sequence rather than raising all budgets.
- Use Orca Browser through the public `orca` CLI for requested manual checks. For layout changes, verify narrow/wide viewports and dark/light modes in the shared product component.
- Run relevant checks and `git diff --check`; report failures and coverage limits. Fix shared product code, not only dev fixtures. Do not create task-specific planning documents unless requested.
