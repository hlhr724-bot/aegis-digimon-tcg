import { deploymentEndpoint, loadCurrentDeploymentManifest, usesSlotDeploymentRouter } from "@/net/deployment";

export async function getSocialEndpoint(): Promise<{ http: string; websocket: string }> {
  if (
    usesSlotDeploymentRouter({
      production: import.meta.env.PROD,
      deploymentMode: import.meta.env.VITE_AEGIS_DEPLOYMENT_MODE,
    })
  ) {
    const manifest = await loadCurrentDeploymentManifest({
      bundleRevision: import.meta.env.VITE_AEGIS_REVISION,
      navigation: window.location,
    });
    return deploymentEndpoint(location, manifest.active.slot);
  }
  const endpoint = import.meta.env.VITE_AEGIS_API_URL ?? `http://${location.hostname}:2567`;
  return { http: endpoint.replace(/^ws/, "http"), websocket: endpoint.replace(/^http/, "ws") };
}
