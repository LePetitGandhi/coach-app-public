/**
 * Worker Cloudflare — Coach Aïmen.
 *
 *  - /api/state : lecture / écriture de l'état synchronisé (D1), protégée par
 *    le secret SYNC_TOKEN (en-tête `Authorization: Bearer …`) ;
 *  - anciennes URL : redirigées vers l'onglet correspondant ;
 *  - tout le reste : fichiers statiques de `out/`.
 */

const ROW_ID = "main";
const MAX_BYTES = 1_800_000;
const HISTORY_EVERY_MS = 60 * 60 * 1000;
const HISTORY_KEEP = 60;

const REDIRECTS = [
  [/^\/(login|why|maintenance)\/?$/, "/"],
  [/^\/auth\/callback\/?$/, "/"],
  [/^\/musculation\/historique\/?$/, "/progression"],
  [/^\/musculation\/seance\//, "/musculation"],
  [/^\/nutrition\/(batch|courses|recettes)\/?$/, "/nutrition"],
];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request, env) {
  const expected = env.SYNC_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

async function handleState(request, env) {
  if (!env.SYNC_TOKEN) return json({ error: "SYNC_TOKEN non configuré" }, 503);
  if (!authorized(request, env)) return json({ error: "Code de synchronisation invalide" }, 401);

  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated_at FROM app_state WHERE id = ?").bind(ROW_ID).first();
    if (!row) return json({ data: null, updatedAt: 0 });
    return json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
  }

  if (request.method === "PUT") {
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "État trop volumineux" }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "JSON invalide" }, 400);
    }
    if (!body || typeof body.data !== "object" || body.data === null) return json({ error: "Champ data manquant" }, 400);

    const now = Date.now();
    const data = JSON.stringify(body.data);
    await env.DB.batch([
      // Copie de l'état précédent dans l'historique, au plus une fois par heure.
      env.DB.prepare(
        `INSERT OR IGNORE INTO app_state_history (saved_at, data)
         SELECT updated_at, data FROM app_state
         WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM app_state_history WHERE saved_at > ?2)`,
      ).bind(ROW_ID, now - HISTORY_EVERY_MS),
      env.DB.prepare(
        `DELETE FROM app_state_history WHERE saved_at NOT IN
         (SELECT saved_at FROM app_state_history ORDER BY saved_at DESC LIMIT ?1)`,
      ).bind(HISTORY_KEEP),
      env.DB.prepare(
        `INSERT INTO app_state (id, data, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      ).bind(ROW_ID, data, now),
    ]);
    return json({ ok: true, updatedAt: now });
  }

  return json({ error: "Méthode non autorisée" }, 405);
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/state") return handleState(request, env);
    if (url.pathname === "/api/coach-feedback") return json({ ok: true });

    for (const [pattern, target] of REDIRECTS) {
      if (pattern.test(url.pathname)) return Response.redirect(new URL(target, url).toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
