import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { motionReferenceAssets } from "./dev/motionReferenceAssets";
import { motionPreferenceSelectors } from "./dev/motionPreferenceSelectors";
import { MOTION_ATTRIBUTE } from "./src/design/motion/motionAttribute";
import { MotionMode } from "./src/design/motion/MotionMode";

const requestedTestMaxThreads = Number(process.env.TEST_MAX_THREADS ?? 4);
const testMaxThreads =
  Number.isInteger(requestedTestMaxThreads) && requestedTestMaxThreads > 0 ? requestedTestMaxThreads : 4;

/** Match the gateway's directory-index behavior for generated public guide pages. */
function strategyGuideDirectories(): Plugin {
  return {
    name: "strategy-guide-directories",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = request.url?.replace(/^(\/strategy-guides\/(?:[a-z0-9-]+\/)?)(?=\?|$)/, "$1index.html");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    strategyGuideDirectories(),
    motionReferenceAssets(fileURLToPath(new URL("./.motion-reference", import.meta.url)), ["MuhkUzGAeHA"]),
  ],
  resolve: {
    alias: {
      // Scenario tests (test/) render the real client against the real
      // AegisRoom, imported straight from apps/api source — see
      // the scenario test harness. Not reachable from
      // product code, so it never affects the shipped bundle.
      "@aegis-api": fileURLToPath(new URL("../api/src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      { extends: true, test: { name: "ranked-ui", include: ["src/ranked/**/*.test.tsx"], environment: "jsdom" } },
      {
        extends: true,
        test: { name: "achievements-ui", include: ["src/achievements/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: {
          name: "arena-appearance",
          include: ["src/game/screen/hooks/useBoardMeasurements.test.tsx"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: { name: "replay-player", include: ["src/replays/ReplayPlayer.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "bot-personas", include: ["src/bot/personas/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "motion-preference", include: ["src/design/motion/**/*.test.ts"], environment: "jsdom" },
      },
      {
        extends: true,
        test: {
          name: "card-confirmation",
          include: [
            "src/game/cardConfirmation/**/*.test.ts",
            "src/game/overlay/choice/optionalActivationCancellation.test.tsx",
          ],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: { name: "tutorial-ui", include: ["src/game/tutorial/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "card-text-ui", include: ["src/i18n/useCardTranslationState.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "arena-input", include: ["src/game/input/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "story-ui", include: ["src/story/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "deck-providers", include: ["src/deckProviders/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "card-language", include: ["src/screens/cardLanguage/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "client-errors-ui", include: ["src/clientErrors/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "inspector-sources", include: ["src/game/arenaInspectorSources.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "dp-hint", include: ["src/game/piece/PermanentDpDeltaHint.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: {
          name: "effect-source-marks-ui",
          include: [
            "src/game/piece/handEffectSourceMarks.test.tsx",
            "src/game/overlay/viewer/trashEffectSourceMarks.test.tsx",
          ],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: { name: "social-ui", include: ["src/social/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: {
          name: "tournament-reports-ui",
          include: ["src/tournaments/TournamentReportButton.test.tsx", "src/bugs/ReportedTournamentsPanel.test.tsx"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: {
          name: "tournament-leaderboard-ui",
          include: ["src/tournaments/TournamentLeaderboard.test.tsx"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: {
          name: "default",
          exclude: [
            "src/game/screen/hooks/useBoardMeasurements.test.tsx",
            "src/replays/ReplayPlayer.test.tsx",
            "src/social/**/*.test.tsx",
            "src/i18n/useCardTranslationState.test.tsx",
            ...configDefaults.exclude,
            "e2e/**",
            "src/ranked/**/*.test.tsx",
            "src/achievements/**/*.test.tsx",
            "src/bot/personas/**/*.test.tsx",
            "src/design/motion/**/*.test.ts",
            "src/game/cardConfirmation/**/*.test.ts",
            "src/game/overlay/choice/optionalActivationCancellation.test.tsx",
            "src/game/input/**/*.test.tsx",
            "src/screens/cardLanguage/**/*.test.tsx",
            "src/clientErrors/**/*.test.tsx",
            "src/tournaments/TournamentReportButton.test.tsx",
            "src/bugs/ReportedTournamentsPanel.test.tsx",
            "src/tournaments/TournamentLeaderboard.test.tsx",
            "src/story/**/*.test.tsx",
            "src/design/tokenArt/**/*.test.tsx",
            "src/screens/community/**/*.test.tsx",
            "src/game/arenaInspectorSources.test.tsx",
            "src/game/piece/PermanentDpDeltaHint.test.tsx",
            "src/game/piece/handEffectSourceMarks.test.tsx",
            "src/game/overlay/viewer/trashEffectSourceMarks.test.tsx",
            "src/game/log/**/*.test.tsx",
            "src/deckProviders/**/*.test.tsx",
            "src/learn/**/*.test.tsx",
            "src/game/tutorial/**/*.test.tsx",
            "src/game/screen/layout/GuestApprovalPanel.test.tsx",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "token-art",
          include: ["src/design/tokenArt/**/*.test.tsx"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: { name: "community-ui", include: ["src/screens/community/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: { name: "match-log-ui", include: ["src/game/log/**/*.test.tsx"], environment: "jsdom" },
      },
      {
        extends: true,
        test: {
          name: "guest-approval-ui",
          include: ["src/game/screen/layout/GuestApprovalPanel.test.tsx"],
          environment: "jsdom",
        },
      },
    ],
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: [
      "./test/scenarioHarness/setupJsdomPolyfills.ts",
      "./test/setupGateExpiry.ts",
      "./test/setupLazyModules.ts",
    ],
    // The scenario harness boots a real in-process websocket server; vitest's
    // default forked-process pool serializes console/log traffic across an IPC
    // boundary and chokes on the non-plain objects Colyseus logs there. Threads
    // share memory instead, sidestepping that boundary entirely.
    pool: "threads",
    // Each scenario file boots its own websocket server + Colyseus room + React
    // render tree and drives it through several seconds of real async traffic.
    // With vitest's default worker count (= CPU count), a full-suite run packs
    // that many of these onto the machine at once; under the resulting CPU
    // contention, already-generous 10s findByRole/waitFor timeouts in the
    // heaviest files (attackPermanent, evade, mobileCore, ...) occasionally get
    // starved past their deadline — flaky only in the full run, never in
    // isolation. Capping concurrency gives each scenario server enough CPU
    // headroom to finish inside its timeout. Keep low-memory gates on the thread
    // pool: forcing `forks` makes Colyseus's non-plain log payloads cross IPC and
    // crash Vitest's serializer. Override only the thread count when RAM is constrained.
    maxWorkers: testMaxThreads,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/assets/card-images": {
        target: process.env.AEGIS_CARD_IMAGE_ORIGIN ?? "https://aegis-digi.online/assets/card-images",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/assets\/card-images/, ""),
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        motionPreferenceSelectors({
          attribute: MOTION_ATTRIBUTE,
          reducedValue: MotionMode.REDUCED.value,
          fullValue: MotionMode.FULL.value,
        }),
      ],
    },
    // Lightning CSS adds the vendor prefixes older iOS still needs
    // (-webkit-user-select, -webkit-backdrop-filter). Versions are encoded as
    // major << 16 | minor << 8, matching the browsers color-mix() requires.
    lightningcss: {
      targets: {
        safari: (16 << 16) | (4 << 8),
        ios_saf: (16 << 16) | (4 << 8),
        chrome: 111 << 16,
        android: 111 << 16,
        firefox: 115 << 16,
        samsung: 22 << 16,
      },
    },
  },
  json: {
    stringify: true,
  },
  build: {
    target: "es2022",
    cssMinify: "lightningcss",
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        sourcemapExcludeSources: true,
        manualChunks(id) {
          if (
            /node_modules\/(three|@react-three|postprocessing|react-reconciler|react-use-measure|its-fine)\//.test(id)
          ) {
            return "three-vendor";
          }
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/scheduler")
          ) {
            return "react-vendor";
          }
          if (id.includes("node_modules/@colyseus/schema")) {
            return "colyseus-schema";
          }
          if (
            id.includes("node_modules/colyseus") ||
            id.includes("node_modules/@colyseus") ||
            id.includes("node_modules/msgpackr")
          ) {
            return "colyseus-sdk";
          }
          if (id.includes("cards.json")) {
            return "cards-data";
          }
          if (id.includes("effects.json")) {
            return "effects-data";
          }
        },
      },
    },
  },
});
