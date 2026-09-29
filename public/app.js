/**
 * Fortune Atlas — frontend partagé (live via /api/*, statique via window.ATLAS_STATIC).
 * Vues : graphe similarité 3D (force-directed), scopes (colonnes Miller), timeline.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Rapport d'erreur visible (sinon écran noir silencieux).
window.addEventListener("error", (e) => {
  const box = document.getElementById("err");
  if (box) {
    box.style.display = "block";
    box.textContent = "Erreur JS : " + (e.message || e.error);
  }
});

const TYPE_COLORS = {
  fact: "#4cc9f0",
  preference: "#f72585",
  decision: "#ffd166",
  commitment: "#06d6a0",
  relationship: "#b5179e",
  event: "#ff9e00",
  note: "#8ecae6",
};

function scopeColor(scope) {
  let h = 0;
  for (let i = 0; i < scope.length; i++) h = (h * 31 + scope.charCodeAt(i)) >>> 0;
  return "hsl(" + (h % 360) + ",70%,60%)";
}
function shortScope(s) {
  return s.replace(/^discord\/dm\//, "dm:").replace(/^discord\//, "srv:");
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function loadData() {
  if (window.ATLAS_STATIC) return window.ATLAS_STATIC;
  const [mem, edges, scopes] = await Promise.all([
    fetch("/api/memories").then((r) => r.json()),
    fetch("/api/edges?k=3&minSim=0.15").then((r) => r.json()),
    fetch("/api/scopes").then((r) => r.json()),
  ]);
  return { memories: mem.memories, edges: edges.edges, scopes: scopes.tree };
}

const DATA = await loadData();
const MEM = DATA.memories;
const indexById = new Map(MEM.map((m, i) => [m.shortId, i]));
document.getElementById("sub").textContent =
  `${MEM.length} souvenirs · arêtes = cosinus + Jaccard au-dessus des seuils · arbre POSIX des scopes`;

// ---------- scène ----------
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
cam.position.set(0, 6, 34);
const ren = new THREE.WebGLRenderer({ antialias: true });
ren.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
ren.setSize(innerWidth, innerHeight);
document.getElementById("c").appendChild(ren.domElement);
const ctl = new OrbitControls(cam, ren.domElement);
ctl.enableDamping = true;

const group = new THREE.Group();
scene.add(group);
const geo = new THREE.SphereGeometry(0.9, 16, 16);
const meshes = MEM.map((p, i) => {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: TYPE_COLORS[p.type] || "#fff", transparent: true, opacity: 0.95 }),
  );
  // Départ compact (boule r≈4) : pas d'explosion initiale, convergence rapide.
  const r = 2 + Math.random() * 2.5;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  m.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
  m.userData.i = i;
  m.frustumCulled = false; // jamais élagués : positions issues de la simu
  group.add(m);
  return m;
});
// ---------- similarités : cosinus (vecteurs) OU Jaccard (lexique) ----------
// Une arête existe si AU MOINS un des deux seuils passe.
// Vert = les deux, bleu = vectoriel seul, orange = lexical seul.
const STOP = new Set(
  ("le la les de des du un une et est en dans que qui pour pas sur au aux ce ces " +
    "il elle ils elles nous vous je tu on ne se son sa ses leur leurs mon ma mes " +
    "ton ta tes avec tout toute tous toutes plus comme par mais donc car ni ou y " +
    "a est sont ete avoir faire fait dire peut aussi tres bien encore alors entre " +
    "the and for with from that this these those are was were has have had will would " +
    "can could should there their them they you your his her its our").split(" "),
);
function lexTokens(text) {
  const set = new Set();
  for (const w of (text || "").toLowerCase().split(/[^a-zà-ÿ0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) set.add(w);
  }
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
function cosine(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
const TOK = MEM.map((m) => lexTokens(m.content + " " + (m.summary || "")));
const VEC = MEM.map((m) => (Array.isArray(m.vector) && m.vector.length ? m.vector : null));

let EDGES = [];
let edgeLines = null;
const GREEN = new THREE.Color("#3ddc84");
const BLUE = new THREE.Color("#4cc9f0");
const ORANGE = new THREE.Color("#ff9e00");
function computeEdges() {
  const tVEl = document.getElementById("vVec");
  const tLEl = document.getElementById("vLex");
  const maxEl = document.getElementById("vMax");
  if (!tVEl || !tLEl || !maxEl) return;
  const tV = Number(tVEl.value);
  const tL = Number(tLEl.value);
  const maxE = Number(maxEl.value);
  document.getElementById("vVecVal").textContent = tV.toFixed(2);
  document.getElementById("vLexVal").textContent = tL.toFixed(2);
  document.getElementById("vMaxVal").textContent = String(maxE);
  const list = [];
  for (let i = 0; i < MEM.length; i++) {
    if (!VEC[i]) continue;
    for (let j = i + 1; j < MEM.length; j++) {
      if (!VEC[j]) continue;
      const vec = cosine(VEC[i], VEC[j]);
      const lex = jaccard(TOK[i], TOK[j]);
      const okV = vec >= tV;
      const okL = lex >= tL;
      if (!okV && !okL) continue;
      // Score : les deux accords d'abord, puis force brute.
      const score = (okV ? vec : 0) + (okL ? lex : 0) + (okV && okL ? 1 : 0);
      list.push({ a: i, b: j, sim: vec, lex, kind: okV && okL ? 0 : okV ? 1 : 2, score });
    }
  }
  list.sort((x, y) => y.score - x.score);
  const kept = list.slice(0, maxE);
  EDGES = kept;
  updateShownEdges();
  document.getElementById("edgeCount").textContent = kept.length + " / " + list.length + " arêtes (vec ≥ " + tV.toFixed(2) + " OU lex ≥ " + tL.toFixed(2) + ")";
}

// Arêtes affichées = sous-ensemble dont les deux extrémités sont visibles.
// Reconstruit à chaque changement de filtre (événement discret, pas par frame).
let shownEdges = [];
function updateShownEdges() {
  shownEdges = EDGES.filter((e) => meshes[e.a].visible && meshes[e.b].visible);
  buildEdgeLines(shownEdges);
}
function buildEdgeLines(list) {
  if (edgeLines) {
    group.remove(edgeLines);
    edgeLines.geometry.dispose();
    edgeLines.material.dispose();
    edgeLines = null;
  }
  if (!list.length) {
    syncEdges();
    return;
  }
  const pos = new Float32Array(list.length * 6);
  const col = new Float32Array(list.length * 6);
  const KINDS = [GREEN, BLUE, ORANGE];
  list.forEach((e, k) => {
    const c = KINDS[e.kind];
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  edgeLines = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }),
  );
  edgeLines.frustumCulled = false; // positions mises à jour par frame : pas d'élagage
  edgeLines.visible = view === "graph";
  group.add(edgeLines);
  syncEdges();
}
let edgeTimer = null;
function scheduleEdges(reheat) {
  clearTimeout(edgeTimer);
  edgeTimer = setTimeout(() => {
    computeEdges();
    if (reheat) temperature = Math.max(temperature, 0.5);
  }, 150);
}
document.getElementById("vVec").oninput = () => scheduleEdges(false);
document.getElementById("vLex").oninput = () => scheduleEdges(false);
document.getElementById("vMax").oninput = () => scheduleEdges(false);

function syncEdges() {
  if (!edgeLines) return;
  const pos = edgeLines.geometry.attributes.position;
  shownEdges.forEach((e, k) => {
    const a = meshes[e.a].position;
    const b = meshes[e.b].position;
    pos.setXYZ(k * 2, a.x, a.y, a.z);
    pos.setXYZ(k * 2 + 1, b.x, b.y, b.z);
  });
  pos.needsUpdate = true;
}

// ---------- force-directed (Fruchterman-Reingold simplifié) ----------
let temperature = 0.5;
const disp = new Float32Array(meshes.length * 3);
function resim() {
  temperature = 0.6;
}
document.getElementById("resim").onclick = resim;

const REP_K = 7; // distance optimale : répulsion k²/d, attraction d²/k
const ATT = 0.02;
const GRAV = 1.4;
const MAX_STEP = 3; // déplacement max par frame × température (anti-catapulte)
function physicsStep() {
  if (temperature < 0.02) {
    temperature = 0;
    return;
  }
  const n = meshes.length;
  disp.fill(0);
  for (let i = 0; i < n; i++) {
    if (!meshes[i].visible) continue;
    // Garde-fou : un nœud parti à l'infini / NaN revient dans la boule.
    const pi0 = meshes[i].position;
    if (!isFinite(pi0.x + pi0.y + pi0.z) || Math.abs(pi0.x) + Math.abs(pi0.y) + Math.abs(pi0.z) > 1500) {
      pi0.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    }
    for (let j = i + 1; j < n; j++) {
      if (!meshes[j].visible) continue;
      let dx = meshes[i].position.x - meshes[j].position.x;
      let dy = meshes[i].position.y - meshes[j].position.y;
      let dz = meshes[i].position.z - meshes[j].position.z;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 0.5) d = 0.5;
      const f = ((REP_K * REP_K) / d / d) * temperature;
      dx /= d; dy /= d; dz /= d;
      disp[i * 3] += dx * f; disp[i * 3 + 1] += dy * f; disp[i * 3 + 2] += dz * f;
      disp[j * 3] -= dx * f; disp[j * 3 + 1] -= dy * f; disp[j * 3 + 2] -= dz * f;
    }
  }
  for (const e of shownEdges) {
    if (!meshes[e.a].visible || !meshes[e.b].visible) continue;
    const a = meshes[e.a].position;
    const b = meshes[e.b].position;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
    const f = ((d * d) / REP_K) * ATT * (0.3 + e.sim) * temperature / d;
    disp[e.a * 3] += (b.x - a.x) * f; disp[e.a * 3 + 1] += (b.y - a.y) * f; disp[e.a * 3 + 2] += (b.z - a.z) * f;
    disp[e.b * 3] += (a.x - b.x) * f; disp[e.b * 3 + 1] += (a.y - b.y) * f; disp[e.b * 3 + 2] += (a.z - b.z) * f;
  }
  const cap = temperature * MAX_STEP;
  for (let i = 0; i < n; i++) {
    if (!meshes[i].visible) continue;
    const p = meshes[i].position;
    const dn = Math.hypot(p.x, p.y, p.z) + 0.01;
    const pull = (GRAV * temperature) / dn;
    let mx = disp[i * 3] - p.x * pull;
    let my = disp[i * 3 + 1] - p.y * pull;
    let mz = disp[i * 3 + 2] - p.z * pull;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    if (len > cap && len > 0) {
      const sc = cap / len;
      mx *= sc; my *= sc; mz *= sc;
    }
    p.x += mx;
    p.y += my;
    p.z += mz;
  }
  temperature *= 0.97;
  syncEdges();
}

// ---------- layout timeline ----------
const times = MEM.map((m) => Date.parse(m.createdAt) || 0);
const tMin = Math.min(...times);
const tMax = Math.max(...times, tMin + 1);
const lanes = { global: 7, discord: 0, personal: -7, other: -14 };
function branchOf(scope) {
  const h = (scope || "").split("/")[0];
  return lanes[h] !== undefined ? h : "other";
}
const timeTargets = MEM.map((m, i) => {
  const t = (Date.parse(m.createdAt) || tMin - 1 - i) ;
  return {
    x: ((t - tMin) / (tMax - tMin)) * 44 - 22,
    y: lanes[branchOf(m.scope)] + ((i * 37) % 7 - 3) * 0.5,
    z: ((i * 53) % 9 - 4) * 0.8,
  };
});

// ---------- état / filtres ----------
let view = "graph";
// ---------- pelures de sensibilité ----------
// Règle du bot : en serveur, sensibilité max 'personal' (jamais 'private') ;
// en DM, jusqu'à 'private'. 'restricted' n'est visible nulle part.
const SENS_RANK = { public: 0, personal: 1, private: 2, restricted: 3 };
const SENS_COLORS = { public: "#06d6a0", personal: "#4cc9f0", private: "#ffd166", restricted: "#ff5555" };
let pelureCap = null; // null = pas de filtre (vues normales)
function sensRank(s) {
  return SENS_RANK[s] !== undefined ? SENS_RANK[s] : 1;
}
let colorMode = "type";
let hiddenTypes = new Set();
let hiddenScopes = new Set();
let showForg = true;
let query = "";

function visible(p) {
  if (colorMode === "type" ? hiddenTypes.has(p.type) : hiddenScopes.has(p.scope)) return false;
  if (p.status === "forgotten" && !showForg) return false;
  if (view === "peel" && pelureCap !== null && sensRank(p.sensitivity) > pelureCap) return false;
  return true;
}
function recolor() {
  meshes.forEach((m) => {
    const p = MEM[m.userData.i];
    m.material.color.set(colorMode === "type" ? TYPE_COLORS[p.type] || "#fff" : scopeColor(p.scope));
  });
}
function refresh() {
  let n = 0;
  meshes.forEach((m) => {
    const p = MEM[m.userData.i];
    const v = visible(p);
    m.visible = v;
    if (v) n++;
    const hit = query && (p.content + " " + (p.summary || "")).toLowerCase().includes(query);
    const inTag = selectedTag && (p.tags || []).includes(selectedTag);
    m.scale.setScalar(hit || inTag ? 2.2 : 1);
    m.material.opacity = p.status === "forgotten" ? 0.25 : query && !hit && !inTag ? 0.25 : 0.95;
  });
  if (edgeLines) edgeLines.visible = view === "graph";
  tagGroup.visible = view === "tags";
  updateShownEdges();
  document.getElementById("count").textContent = n + " / " + MEM.length + " visibles";
}

// ---------- graphe biparti des tags ----------
// Hubs (octaèdres or) sur un anneau + arêtes vers les souvenirs membres.
// Layout statique (pas de simu) : les souvenirs gardent leur position du graphe.
const tagGroup = new THREE.Group();
tagGroup.visible = false;
group.add(tagGroup);
const tagHubs = []; // {tag, count, mesh, members:[memIdx]}
const tagGeo = new THREE.OctahedronGeometry(0.85);
{
  const byTag = new Map();
  MEM.forEach((m, i) => {
    for (const t of m.tags || []) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(i);
    }
  });
  const entries = [...byTag.entries()].sort((a, b) => b[1].length - a[1].length);
  const R = 21;
  entries.forEach(([tag, members], k) => {
    const a = (k / entries.length) * Math.PI * 2;
    const mesh = new THREE.Mesh(
      tagGeo,
      new THREE.MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.9 }),
    );
    mesh.position.set(Math.cos(a) * R, ((k * 37) % 11 - 5) * 0.9, Math.sin(a) * R);
    mesh.frustumCulled = false;
    mesh.userData.tag = tag;
    tagGroup.add(mesh);
    tagHubs.push({ tag, count: members.length, mesh, members });
  });
}
let tagEdges = null;
function buildTagEdges() {
  if (tagEdges) {
    tagGroup.remove(tagEdges);
    tagEdges.geometry.dispose();
    tagEdges.material.dispose();
    tagEdges = null;
  }
  const pos = [];
  for (const h of tagHubs) {
    for (const i of h.members) {
      if (!meshes[i].visible) continue;
      const a = meshes[i].position;
      const b = h.mesh.position;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  tagEdges = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color: 0x8a6d3b, transparent: true, opacity: 0.3 }),
  );
  tagEdges.frustumCulled = false;
  tagGroup.add(tagEdges);
}
let selectedTag = null;
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = document.getElementById("tip");
const detail = document.getElementById("detail");

function pickTargets() {
  const list = meshes.filter((m) => m.visible);
  if (view === "tags") {
    for (const h of tagHubs) list.push(h.mesh);
  }
  return list;
}
function pick(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, cam);
  return ray.intersectObjects(pickTargets())[0];
}
ren.domElement.addEventListener("pointermove", (e) => {
  const hit = pick(e);
  if (hit) {
    if (hit.object.userData.tag) {
      const h = tagHubs.find((x) => x.mesh === hit.object);
      tip.style.display = "block";
      tip.style.left = e.clientX + 14 + "px";
      tip.style.top = e.clientY + 10 + "px";
      tip.innerHTML = "<b>#" + escapeHtml(h.tag) + "</b> · " + h.count + " souvenirs";
      ren.domElement.style.cursor = "pointer";
      return;
    }
    const p = MEM[hit.object.userData.i];
    tip.style.display = "block";
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY + 10 + "px";
    tip.innerHTML = "<b>" + p.type + "</b> · " + escapeHtml(shortScope(p.scope)) + "<br>" + escapeHtml(p.content.slice(0, 140)) + "…";
    ren.domElement.style.cursor = "pointer";
  } else {
    tip.style.display = "none";
    ren.domElement.style.cursor = "grab";
  }
});
function neighborsOf(i) {
  const out = [];
  for (const e of EDGES) {
    if (e.a === i) out.push({ i: e.b, sim: e.sim, lex: e.lex, kind: e.kind });
    else if (e.b === i) out.push({ i: e.a, sim: e.sim, lex: e.lex, kind: e.kind });
  }
  return out.sort((a, b) => b.sim - a.sim).slice(0, 6);
}
function showDetail(i) {
  const p = MEM[i];
  const sibs = MEM.map((q, j) => ({ q, j }))
    .filter(({ q, j }) => j !== i && q.scope === p.scope)
    .slice(0, 6);
  const KIND_DOT = ["#3ddc84", "#4cc9f0", "#ff9e00"];
  const rel = (list, title) =>
    list.length
      ? `<div class="rel"><b>${title}</b>` +
        list
          .map(
            ({ i: j, sim, lex, kind }) =>
              `<button data-i="${j}"><span style="color:${kind !== undefined ? KIND_DOT[kind] : "#8b93b0"}">●</span> ${escapeHtml(MEM[j].content.slice(0, 70))}…` +
              (sim !== undefined ? ` <span style="color:#8b93b0">vec ${(sim * 100) | 0}% · lex ${((lex || 0) * 100) | 0}%</span>` : "") +
              `</button>`,
          )
          .join("") +
        "</div>"
      : "";
  detail.style.display = "block";
  detail.innerHTML =
    `<h2>${p.type} <span style="color:${colorMode === "type" ? TYPE_COLORS[p.type] : scopeColor(p.scope)}">●</span></h2>` +
    `<div class="meta">${p.shortId} · ${p.status} · ${p.sensitivity} · ${p.sourceTrust}<br>scope: ${escapeHtml(p.scope)}<br>créé: ${(p.createdAt || "").slice(0, 10)}${p.summary ? "<br>résumé: " + escapeHtml(p.summary) : ""}${p.tags.length ? "<br>tags: " + escapeHtml(p.tags.join(", ")) : ""}</div>` +
    `<p>${escapeHtml(p.content)}</p>` +
    rel(neighborsOf(i), "voisins proches (cosinus)") +
    rel(sibs.map(({ j }) => ({ i: j })), "même scope");
  detail.querySelectorAll("button[data-i]").forEach((b) => {
    b.onclick = () => {
      const j = Number(b.dataset.i);
      showDetail(j);
      focusNode(j);
    };
  });
}
function focusNode(j) {
  const t = meshes[j].position;
  ctl.target.copy(t);
}
ren.domElement.addEventListener("click", (e) => {
  const hit = pick(e);
  if (!hit) {
    detail.style.display = "none";
    selectedTag = null;
    refresh();
    return;
  }
  if (hit.object.userData.tag) {
    showTag(hit.object.userData.tag);
    return;
  }
  showDetail(hit.object.userData.i);
});

function showTag(tag) {
  const h = tagHubs.find((x) => x.tag === tag);
  if (!h) return;
  selectedTag = tag;
  refresh();
  detail.style.display = "block";
  detail.innerHTML =
    `<h2>#${escapeHtml(tag)} <span style="color:#ffd166">◆</span></h2>` +
    `<div class="meta">${h.count} souvenirs tagués</div>` +
    `<div class="rel">` +
    h.members
      .map((j) => `<button data-i="${j}">${escapeHtml((MEM[j].summary || MEM[j].content).slice(0, 70))}… <span style="color:#8b93b0">${MEM[j].type}</span></button>`)
      .join("") +
    `</div><div class="rel"><button data-clear="1">✕ désélectionner</button></div>`;
  detail.querySelectorAll("button[data-i]").forEach((b) => {
    b.onclick = () => {
      const j = Number(b.dataset.i);
      showDetail(j);
      focusNode(j);
    };
  });
  const clear = detail.querySelector("button[data-clear]");
  if (clear)
    clear.onclick = () => {
      selectedTag = null;
      detail.style.display = "none";
      refresh();
    };
}

// ---------- légendes / contrôles ----------
const leg = document.getElementById("legend");
Object.keys(TYPE_COLORS).forEach((t) => {
  const n = MEM.filter((p) => p.type === t).length;
  const d = document.createElement("span");
  d.className = "chip";
  d.innerHTML = `<span class="dot" style="background:${TYPE_COLORS[t]}"></span>${t} (${n})`;
  d.onclick = () => {
    hiddenTypes.has(t) ? hiddenTypes.delete(t) : hiddenTypes.add(t);
    d.classList.toggle("off");
    refresh();
  };
  leg.appendChild(d);
});
const scBox = document.getElementById("scopes");
{
  const counts = {};
  MEM.forEach((p) => { counts[p.scope] = (counts[p.scope] || 0) + 1; });
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => {
      const d = document.createElement("div");
      d.innerHTML = `<span class="chip"><span class="dot" style="background:${scopeColor(s)}"></span>${escapeHtml(shortScope(s))} (${n})</span>`;
      const chip = d.querySelector(".chip");
      chip.onclick = () => {
        hiddenScopes.has(s) ? hiddenScopes.delete(s) : hiddenScopes.add(s);
        chip.classList.toggle("off");
        refresh();
      };
      scBox.appendChild(d);
    });
}
document.getElementById("mType").onclick = (e) => {
  colorMode = "type";
  e.target.classList.add("on");
  document.getElementById("mScope").classList.remove("on");
  leg.style.display = "flex";
  scBox.style.display = "none";
  recolor(); refresh();
};
document.getElementById("mScope").onclick = (e) => {
  colorMode = "scope";
  e.target.classList.add("on");
  document.getElementById("mType").classList.remove("on");
  leg.style.display = "none";
  scBox.style.display = "block";
  recolor(); refresh();
};
document.getElementById("search").oninput = (e) => {
  query = e.target.value.trim().toLowerCase();
  refresh();
};
document.getElementById("showForg").onchange = (e) => {
  showForg = e.target.checked;
  refresh();
};

// ---------- vues ----------
const miller = document.getElementById("miller");
// ---------- radar : anniversaires, programmés, expirés ----------
function daysUntil(month, day) {
  const now = new Date();
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

function renderRadar() {
  const box = document.getElementById("radar");
  const now = new Date();
  const bdays = [];
  for (const m of MEM) {
    if (!m.occurredAt) continue;
    const d = new Date(m.occurredAt);
    if (isNaN(d)) continue;
    bdays.push({ m, inDays: daysUntil(d.getMonth() + 1, d.getDate()), md: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  bdays.sort((a, b) => a.inDays - b.inDays);
  const upcoming = MEM.filter((m) => m.validFrom && new Date(m.validFrom) > now);
  const expired = MEM.filter((m) => m.validTo && new Date(m.validTo) < now);
  const item = (m, extra) =>
    `<div class="item" data-id="${m.shortId}">${extra} ${escapeHtml((m.summary || m.content).slice(0, 70))}…</div>`;
  let html = `<h3>🎂 Anniversaires (${bdays.length})</h3>`;
  html += bdays.length
    ? bdays.map(({ m, inDays, md }) => item(m, inDays === 0 ? "🎉 <b>AUJOURD'HUI</b>" : `J-${inDays} · ${md}`)).join("")
    : "aucun occurred_at renseigné";
  html += `<h3>⏳ Programmés — valid_from futur (${upcoming.length})</h3>`;
  html += upcoming.length ? upcoming.map((m) => item(m, "dès le " + (m.validFrom || "").slice(0, 10))).join("") : "aucun";
  html += `<h3>⌛ Expirés — valid_to passé (${expired.length})</h3>`;
  html += expired.length
    ? expired.map((m) => item(m, "expiré le " + (m.validTo || "").slice(0, 10))).join("")
    : `<span style="color:#8b93b0">aucun — le jour où valid_to servira, ils apparaîtront ici</span>`;
  box.innerHTML = html;
  box.querySelectorAll(".item[data-id]").forEach((el) => {
    el.onclick = () => {
      const j = indexById.get(el.dataset.id);
      if (j !== undefined) {
        showDetail(j);
        focusNode(j);
      }
    };
  });
}
function setView(v) {
  view = v;
  for (const id of ["vGraph", "vTree", "vTime", "vPeel", "vTags", "vRadar"]) document.getElementById(id).classList.remove("on");
  document.getElementById(v === "graph" ? "vGraph" : v === "tree" ? "vTree" : v === "time" ? "vTime" : v === "peel" ? "vPeel" : v === "tags" ? "vTags" : "vRadar").classList.add("on");
  miller.style.display = v === "tree" ? "flex" : "none";
  document.getElementById("peel").style.display = v === "peel" ? "block" : "none";
  document.getElementById("radar").style.display = v === "radar" ? "block" : "none";
  if (v === "tree") renderMiller();
  if (v === "radar") renderRadar();
  if (v === "peel") {
    pelureCap = 1;
    renderPeel();
  } else {
    pelureCap = null;
  }
  if (v === "tags") buildTagEdges();
  refresh();
}
document.getElementById("vGraph").onclick = () => setView("graph");
document.getElementById("vTree").onclick = () => setView("tree");
document.getElementById("vTime").onclick = () => setView("time");
document.getElementById("vPeel").onclick = () => setView("peel");
document.getElementById("vTags").onclick = () => setView("tags");
document.getElementById("vRadar").onclick = () => setView("radar");

function renderPeel() {
  const box = document.getElementById("peel");
  const ctxName = pelureCap <= 1 ? "serveur" : "DM";
  const layers = ["public", "personal", "private", "restricted"];
  let html = `<h3>Contexte : <button class="mini" id="ctxSrv" style="${pelureCap <= 1 ? "background:#2a3350" : ""}">serveur (≤ personal)</button> <button class="mini" id="ctxDm" style="${pelureCap > 1 ? "background:#2a3350" : ""}">DM (≤ private)</button></h3>`;
  html += "<h3>Couches (visibles / total)</h3>";
  for (const layer of layers) {
    const all = MEM.filter((p) => p.sensitivity === layer);
    const vis = all.filter((p) => sensRank(p.sensitivity) <= pelureCap && (p.status !== "forgotten" || showForg)).length;
    html += `<div class="layer"><span><span class="dot" style="background:${SENS_COLORS[layer]}"></span>${layer}</span><b>${vis} / ${all.length}</b></div>`;
  }
  const exposed = MEM.filter((p) => p.sensitivity === "personal" && p.status === "active");
  html += `<h3 class="warn">Exposés en ${ctxName} mais pas publics (${exposed.length}) — le graphe ne montre que ce contexte</h3>`;
  html += exposed
    .slice(0, 40)
    .map((m) => `<div class="item" data-id="${m.shortId}">👁 ${escapeHtml((m.summary || m.content).slice(0, 70))}… <span style="color:#8b93b0">${escapeHtml(shortScope(m.scope))}</span></div>`)
    .join("");
  if (exposed.length > 40) html += `<div class="item">… +${exposed.length - 40} autres</div>`;
  const hiddenEverywhere = MEM.filter((p) => sensRank(p.sensitivity) > 2);
  if (hiddenEverywhere.length) {
    html += `<h3 class="bad">Invisibles partout (restricted, ${hiddenEverywhere.length})</h3>`;
    html += hiddenEverywhere
      .slice(0, 20)
      .map((m) => `<div class="item" data-id="${m.shortId}">🔒 ${escapeHtml((m.summary || m.content).slice(0, 70))}…</div>`)
      .join("");
  }
  box.innerHTML = html;
  document.getElementById("ctxSrv").onclick = () => {
    pelureCap = 1;
    renderPeel();
    refresh();
  };
  document.getElementById("ctxDm").onclick = () => {
    pelureCap = 2;
    renderPeel();
    refresh();
  };
  box.querySelectorAll(".item[data-id]").forEach((el) => {
    el.onclick = () => {
      const j = indexById.get(el.dataset.id);
      if (j !== undefined) {
        showDetail(j);
        focusNode(j);
      }
    };
  });
}

function memButton(m) {
  return `<div class="item" data-id="${m.shortId}">${escapeHtml((m.summary || m.content).slice(0, 60))}… <span class="n">${m.type} · ${m.status}</span></div>`;
}
function renderMiller() {
  miller.innerHTML = "";
  const cols = [DATA.scopes];
  const draw = () => {
    miller.innerHTML = "";
    cols.forEach((node, depth) => {
      const div = document.createElement("div");
      div.className = "col";
      div.innerHTML = `<h3>${depth === 0 ? "racine" : escapeHtml(node.path)} · ${node.count}</h3>`;
      node.children.forEach((ch) => {
        const el = document.createElement("div");
        el.className = "item" + (cols[depth + 1] === ch ? " sel" : "");
        el.innerHTML = `${escapeHtml(ch.name || "(vide)")} <span class="n">${ch.count}${ch.own ? ` · ${ch.own} ici` : ""}</span>`;
        el.onclick = () => {
          cols.length = depth + 1;
          cols.push(ch);
          draw();
        };
        div.appendChild(el);
      });
      if (node.path) {
        MEM.filter((m) => m.scope === node.path).forEach((m) => {
          const el = document.createElement("div");
          el.innerHTML = memButton(m);
          el.firstChild.onclick = () => showDetail(indexById.get(m.shortId));
          div.appendChild(el);
        });
      }
      miller.appendChild(div);
    });
  };
  draw();
}

addEventListener("resize", () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  ren.setSize(innerWidth, innerHeight);
});

// ---------- boucle ----------
let timeBlend = 0;
const _tmpV = new THREE.Vector3();
document.getElementById("spin").checked = false; // rotation auto OFF par défaut
computeEdges();
refresh();
(function anim() {
  requestAnimationFrame(anim);
  if (document.hidden) return; // onglet masqué : zéro CPU
  if (view === "graph") {
    if (timeBlend > 0) timeBlend = Math.max(0, timeBlend - 0.03);
    physicsStep();
  } else if (view === "time") {
    if (timeBlend < 1) timeBlend = Math.min(1, timeBlend + 0.03);
    _tmpV.set(0, 0, 0);
    meshes.forEach((m, i) => {
      const t = timeTargets[i];
      _tmpV.set(t.x, t.y, t.z);
      m.position.lerp(_tmpV, 0.06 * timeBlend + 0.001);
    });
    syncEdges();
  }
  if (document.getElementById("spin").checked) group.rotation.y += 0.0016;
  ctl.update();
  ren.render(scene, cam);
})();
