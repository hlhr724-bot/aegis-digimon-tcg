import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { synchronizeDeploymentRevision, usesSlotDeploymentRouter } from "./net/deployment";
import { translator } from "./i18n";
import { loadFamousDecks } from "@/game/loadFamousDecks";
import { loadDictionary } from "@/i18n/loadDictionary";
import { loadLocale } from "@/i18n/loadLocale";
import { AegisEmblem } from "./design/AegisLogo";
import { Button } from "./design/primitives";
import { Panel } from "./design/surfaces";
import { installTranslationCompatibility } from "./translationCompatibility";
import { applyDarkMode } from "./design/darkMode";
import { applyInterfaceTheme } from "./design/interfaceTheme";
import { motionPreference } from "@/design/motion/motionPreference";
import { preventIosFocusZoom } from "./design/iosViewport";
import { clientErrorReporter } from "@/clientErrors/clientErrorReporter";
import { installClientErrorListeners } from "@/clientErrors/installClientErrorListeners";
import { reportRecoverableRenderError } from "@/clientErrors/reportRecoverableRenderError";
import { installPreloadErrorRecovery } from "@/net/installPreloadErrorRecovery";
import "./design/tokens.css";
import "./design/base.css";
import "./design/layout.css";
import "./design/primitives.css";

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

export function Startup() {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(
    () =>
      !usesSlotDeploymentRouter({
        production: import.meta.env.PROD,
        deploymentMode: import.meta.env.VITE_AEGIS_DEPLOYMENT_MODE,
      }),
  );
  const [waitingForNetwork, setWaitingForNetwork] = useState(false);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void synchronizeDeploymentRevision({
      bundleRevision: import.meta.env.VITE_AEGIS_REVISION,
      navigation: window.location,
    })
      .then((current) => {
        if (!cancelled && current) setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setWaitingForNetwork(true);
        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        window.setTimeout(() => {
          if (!cancelled) setAttempt((value) => value + 1);
        }, delay);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, ready]);

  if (ready) return <App />;
  // Runs before <App> mounts its I18nProvider, so it reads the locale directly.
  const t = translator(loadLocale());
  return (
    <main className="aegis-startup" role="status" aria-live="polite">
      <Panel as="div" className="aegis-startup__panel">
        <span className="aegis-screen-fallback__mark" aria-hidden="true">
          <span className="aegis-loading-mark" />
          <AegisEmblem size={36} />
        </span>
        <h1>{t(waitingForNetwork ? "redesign.shell.startup.reconnecting" : "redesign.shell.startup.updating")}</h1>
        <p className="aegis-hero-panel__muted">{t("redesign.shell.startup.reserved")}</p>
        {waitingForNetwork ? (
          <Button sound={false} onClick={() => setAttempt((value) => value + 1)}>
            {t("redesign.shell.startup.retry")}
          </Button>
        ) : null}
      </Panel>
    </main>
  );
}

installClientErrorListeners({ target: window, reporter: clientErrorReporter });
installPreloadErrorRecovery({
  target: window,
  readStorage: () => window.sessionStorage,
  reload: () => window.location.reload(),
  isOnline: () => navigator.onLine,
});
const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
applyDarkMode();
applyInterfaceTheme();
motionPreference.apply();
preventIosFocusZoom();
installTranslationCompatibility(container);
loadFamousDecks().catch(() => undefined);
void loadDictionary(loadLocale())
  .catch(() => undefined)
  .finally(() => {
    const rootOptions =
      import.meta.env.PROD || import.meta.env.VITE_AEGIS_CLIENT_ERRORS === "on"
        ? { onRecoverableError: reportRecoverableRenderError }
        : undefined;
    createRoot(container, rootOptions).render(<Startup />);
  });
