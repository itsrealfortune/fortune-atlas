/**
 * Export statique : génère atlas-static.html (données inline, mêmes vues).
 * Usage : bun src/export.ts [sortie.html]
 * La sortie contient l'intégralité du vault : ne jamais la commiter.
 */
import { join } from "node:path";
import { loadVault } from "./core/vault.ts";
import { buildScopeTree, treeToJson } from "./core/scopes.ts";

const out = process.argv[2] ?? join(process.cwd(), "atlas-static.html");

const memories = loadVault();
const byScope = new Map<string, string[]>();
for (const m of memories) {
  const list = byScope.get(m.scope) ?? [];
  list.push(m.shortId);
  byScope.set(m.scope, list);
}
const payload = {
  memories,
  scopes: treeToJson(buildScopeTree(byScope)),
};

const appJs = await Bun.file(
  new URL("../public/app.js", import.meta.url),
).text();
const css = await Bun.file(
  new URL("../public/styles.css", import.meta.url),
).text();
let index = await Bun.file(
  new URL("../public/index.html", import.meta.url),
).text();

// Le statique réutilise index.html : CSS inline, données inline, JS inline.
const html = index
  .replace(
    '<link rel="stylesheet" href="/styles.css">',
    `<style>${css}</style>`,
  )
  .replace(
    '<span class="badge">live</span>',
    '<span class="badge">statique</span>',
  )
  .replace(
    '<script type="module" src="/app.js"></script>',
    `<script>window.ATLAS_STATIC = ${JSON.stringify(payload)};</script>
<script type="module">${appJs}</script>`,
  );

await Bun.write(out, html);
console.log(`Export statique : ${out} (${memories.length} souvenirs)`);
