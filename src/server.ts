/**
 * Fortune Atlas — mini-serveur live (bun, localhost uniquement).
 * Lit le vault en lecture seule, sert le frontend + une API JSON :
 *   GET /api/memories   souvenirs (vecteurs inclus)
 *   GET /api/scopes     arbre POSIX des scopes
 * Le frontend statique (public/) consomme la même forme en mode statique.
 * Les arêtes de similarité sont calculées côté client (cosinus OU Jaccard)
 * pour garder les curseurs de seuil interactifs.
 */
import { loadVault } from "./core/vault.ts";
import { buildScopeTree, treeToJson } from "./core/scopes.ts";

const PORT = Number(process.env.FORTUNE_ATLAS_PORT ?? 8471);

function json(data: unknown): Response {
  return Response.json(data);
}

function sendFile(file: Bun.BunFile, type: string): Response {
  return new Response(file, {
    headers: { "content-type": type, "cache-control": "no-store" },
  });
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  routes: {
    "/": () =>
      sendFile(
        Bun.file(new URL("../public/index.html", import.meta.url)),
        "text/html",
      ),
    "/app.js": () =>
      sendFile(
        Bun.file(new URL("../public/app.js", import.meta.url)),
        "text/javascript",
      ),
    "/styles.css": () =>
      sendFile(
        Bun.file(new URL("../public/styles.css", import.meta.url)),
        "text/css",
      ),
    "/api/memories": () => json({ memories: loadVault() }),
    "/api/scopes": () => {
      const memories = loadVault();
      const byScope = new Map<string, string[]>();
      for (const m of memories) {
        const list = byScope.get(m.scope) ?? [];
        list.push(m.shortId);
        byScope.set(m.scope, list);
      }
      return json({ tree: treeToJson(buildScopeTree(byScope)) });
    },
  },
});

console.log(`Fortune Atlas live sur http://127.0.0.1:${PORT}`);
