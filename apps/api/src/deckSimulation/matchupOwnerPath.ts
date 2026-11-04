const GATEWAY_PROCESS_PATH = /^(?:api\/(?:blue|red|green|g-[a-f0-9]{12})\/)?p[123]$/;

export function matchupOwnerPath(env: NodeJS.ProcessEnv): string | undefined {
  const path = env.AEGIS_PROCESS_PATH?.trim().replace(/^\/+|\/+$/g, "");
  return path !== undefined && GATEWAY_PROCESS_PATH.test(path) ? path : undefined;
}
