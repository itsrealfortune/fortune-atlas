/**
 * Fortune Atlas — mini-serveur live (bun, localhost uniquement).
 * Lit le vault en lecture seule, sert le frontend + une API JSON :
 *   GET /api/memories   souvenirs (vecteurs inclus)
 *   GET /api/edges?k=3&minSim=0.15   arêtes k-NN cosinus
 *   GET /api/scopes     arbre POSIX des scopes
 * Le frontend statique (public/) consomme la même forme en mode statique.
 */
import { loadVault } from "./core/vault.ts";
import { kNearestEdges } from "./core/vectors.ts";
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
    "/api/edges": (req) => {
      const url = new URL(req.url);
      const k = Math.min(10, Math.max(1, Number(url.searchParams.get("k") ?? 3)));
      const minSim = Math.min(
        0.99,
        Math.max(0, Number(url.searchParams.get("minSim") ?? 0.15)),
      );
      const memories = loadVault();
      const edges = kNearestEdges(
        memories.map((m) => m.vector),
        k,
        minSim,
      );
      return json({ edges });
    },
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
