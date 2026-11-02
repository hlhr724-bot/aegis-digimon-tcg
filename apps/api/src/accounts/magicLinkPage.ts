export type MagicLinkPageState = { kind: "confirm"; token: string } | { kind: "unavailable"; homeUrl: string };

export function magicLinkPage(state: MagicLinkPageState): string {
  const body =
    state.kind === "confirm"
      ? `<h1>Sign in to Aegis</h1>
<p>Select the button to finish signing in on this device.</p>
<form method="post" action="/auth/magic-link/consume">
<input type="hidden" name="token" value="${escapeHtml(state.token)}">
<button type="submit">Sign in</button>
</form>`
      : `<h1>This sign-in link no longer works</h1>
<p>It has expired or was already used. Request a new link from the sign-in screen.</p>
<p><a href="${escapeHtml(state.homeUrl)}">Back to Aegis</a></p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in to Aegis</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0f1218;color:#e8ecf3;padding:16px;box-sizing:border-box}
main{max-width:420px;text-align:center}
h1{font-size:1.4rem}
p{color:#b7c0cf;line-height:1.5}
button{font:inherit;font-weight:600;padding:12px 28px;border:0;border-radius:8px;background:#4f7cff;color:#fff;cursor:pointer}
a{color:#8fb0ff}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
