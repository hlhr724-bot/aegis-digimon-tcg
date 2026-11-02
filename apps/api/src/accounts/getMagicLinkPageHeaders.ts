type Params = { homeUrl: string };

export function getMagicLinkPageHeaders({ homeUrl }: Params) {
  const target = URL.canParse(homeUrl) ? new URL(homeUrl) : undefined;
  let formAction = "'self'";
  if (target && (target.protocol === "http:" || target.protocol === "https:")) {
    formAction += ` ${target.origin}`;
  }
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'`,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}
