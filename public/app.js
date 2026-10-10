/**
 * Fortune Atlas — frontend partagé (live via /api/*, statique via window.ATLAS_STATIC).
 * Une seule vue graphe 3D : forme = type, couleur = branche de scope.
 * Layouts : libre (force-directed), temps (récent au centre), anneaux (sensibilité).
 * Menu scopes (colonnes Miller) en tiroir. Hubs de tags intégrés au graphe.
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

// Forme = type de souvenir. Silhouettes volontairement contrastées :
// carré / losange / pointe / borne / boule / anneau / gemme se devinent
// même à petite taille à l'écran (les 7 formes "arrondies" se fondaient).
const TYPE_GEO = {
  fact: () => new THREE.BoxGeometry(0.72, 0.72, 0.72),
  preference: () => new THREE.OctahedronGeometry(0.58),
  decision: () => new THREE.ConeGeometry(0.44, 0.95, 4), // pyramide à faces plates
  commitment: () => new THREE.CylinderGeometry(0.3, 0.3, 0.95, 12), // borne
  relationship: () => new THREE.SphereGeometry(0.46, 16, 12),
  event: () => new THREE.TorusGeometry(0.38, 0.15, 8, 20),
  note: () => new THREE.IcosahedronGeometry(0.54, 0), // gemme à facettes
};
const TYPE_FR = {
  fact: "Fait",
  preference: "Préférence",
  decision: "Décision",
  commitment: "Engagement",
  relationship: "Relation",
  event: "Événement",
  note: "Note",
};
const BRANCH_COLORS = {
  global: "#4cc9f0",
  discord: "#b5179e",
  personal: "#06d6a0",
  other: "#8b93b0",
};
function branchOf(scope) {
  const h = (scope || "").split("/")[0];
  return BRANCH_COLORS[h] ? h : "other";
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
  `${MEM.length} souvenirs · forme = type · couleur = branche · arêtes = cosinus OU Jaccard`;

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

// Lumière + brouillard : sans ombrage, la profondeur 3D est illisible.
// Le brouillard accorde lointain et fond (#0b0e17) pour un vrai cue de profondeur.
scene.background = new THREE.Color("#0b0e17");
scene.fog = new THREE.Fog(0x0b0e17, 36, 110);
const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.7);
keyLight.position.set(18, 26, 14);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x8fb6ff, 0.6); // contre-jour froid
rimLight.position.set(-16, -10, -22);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x1a1030, 0.5));
scene.add(new THREE.AmbientLight(0xffffff, 0.16));

const group = new THREE.Group();
scene.add(group);
const meshes = MEM.map((p, i) => {
  const make = TYPE_GEO[p.type] || TYPE_GEO.note;
  const m = new THREE.Mesh(
    make(),
    // Lambert : éclairé, opaque (depthWrite) — la transparence est réservée
    // aux cas qui la méritent (oubliés, nœuds estompés en sélection).
    new THREE.MeshLambertMaterial({ color: BRANCH_COLORS[branchOf(p.scope)] }),
  );
  const r = 2 + Math.random() * 2.5;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  m.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
  m.userData.i = i;
  m.frustumCulled = false;
  group.add(m);
  return m;
});

// Halo de sélection : anneau billboard autour du nœud choisi, pour le
// repérer d'entre ses voisins (qui ont pourtant taille et opacité proches).
const halo = new THREE.Mesh(
  new THREE.RingGeometry(1.3, 1.46, 32),
  new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
);
halo.visible = false;
halo.frustumCulled = false;
scene.add(halo);
function updateHalo(t) {
  const m = selected !== null ? meshes[selected] : null;
  if (!m || !m.visible) {
    halo.visible = false;
    return;
  }
  halo.visible = true;
  m.getWorldPosition(halo.position);
  halo.quaternion.copy(cam.quaternion); // face toujours la caméra
  const pulse = 1 + 0.07 * Math.sin(t * 0.004);
  halo.scale.setScalar(m.scale.x * 0.95 * pulse);
  halo.material.opacity = 0.5 + 0.25 * Math.sin(t * 0.004);
}

// ---------- similarités : cosinus OU Jaccard ----------
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

// ---------- nuages dimensionnels : paires partageant des tags ----------
// Pas de nœuds visibles : les tags rares partagés attirent (force invisible).
// Tags à un seul souvenir évincés d'office (aucune paire).
const TAGPAIRS = [];
{
  const byTag = new Map();
  MEM.forEach((m, i) => {
    for (const t of m.tags || []) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(i);
    }
  });
  const pairWeight = new Map(); // "i-j" -> nb de tags partagés
  for (const members of byTag.values()) {
    if (members.length < 2) continue;
    for (let x = 0; x < members.length; x++) {
      for (let y = x + 1; y < members.length; y++) {
        const key = members[x] + "-" + members[y];
        pairWeight.set(key, (pairWeight.get(key) || 0) + 1);
      }
    }
  }
  const tagSize = (i) => (MEM[i].tags || []).length;
  for (const [key, shared] of pairWeight) {
    const [i, j] = key.split("-").map(Number);
    // Jaccard sur les sets de tags : un tag rare partagé pèse plus.
    const ti = new Set(MEM[i].tags || []);
    let inter = 0;
    for (const t of MEM[j].tags || []) if (ti.has(t)) inter++;
    const union = ti.size + (MEM[j].tags || []).length - inter;
    TAGPAIRS.push({ a: i, b: j, w: 0.3 + 0.7 * (union ? inter / union : 0) + 0.1 * Math.min(shared, 3) });
  }
}
let tagClouds = true;

let EDGES = [];
let edgeLines = null;
let hoverLines = null; // surbrillance des arêtes d'un nœud survolé
let hoverLinesFor = -1;
let hoverEdgeList = [];
const DEG = new Int16Array(MEM.length); // degré = nb d'arêtes (taille des nœuds)
let hubs = []; // indices triés par degré décroissant (étiquettes)
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
      const score = (okV ? vec : 0) + (okL ? lex : 0) + (okV && okL ? 1 : 0);
      // strength (0..1) : base de l'opacité de l'arête — un lien faible
      // reste un lien, mais ne crie pas aussi fort qu'un lien fort.
      const strength = Math.min(1, okV && okL ? (vec + lex) / 2 + 0.25 : okV ? vec : lex);
      list.push({ a: i, b: j, sim: vec, lex, kind: okV && okL ? 0 : okV ? 1 : 2, score, strength });
    }
  }
  list.sort((x, y) => y.score - x.score);
  const kept = list.slice(0, maxE);
  EDGES = kept;
  DEG.fill(0);
  for (const e of kept) {
    DEG[e.a]++;
    DEG[e.b]++;
  }
  hubs = Array.from({ length: MEM.length }, (_, i) => i)
    .filter((i) => DEG[i] > 0)
    .sort((a, b) => DEG[b] - DEG[a]);
  applyScales();
  updateShownEdges();
  document.getElementById("edgeCount").textContent = kept.length + " / " + list.length + " arêtes (vec ≥ " + tV.toFixed(2) + " OU lex ≥ " + tL.toFixed(2) + ")";
}
let shownEdges = [];
let physEdges = []; // arêtes visibles SANS filtre de sélection (la physique ne doit pas dériver quand on sélectionne)
function updateShownEdges() {
  physEdges = EDGES.filter((e) => meshes[e.a].visible && meshes[e.b].visible);
  // En sélection, seules les arêtes du nœud choisi restent affichées.
  shownEdges = selected !== null ? physEdges.filter((e) => e.a === selected || e.b === selected) : physEdges;
  buildEdgeLines(shownEdges);
  if (hover !== hoverLinesFor) buildHoverLines(hover);
}
function edgeGeometry(list, alphaOf) {
  const pos = new Float32Array(list.length * 6);
  const col = new Float32Array(list.length * 8); // RGBA par sommet
  const KINDS = [GREEN, BLUE, ORANGE];
  list.forEach((e, k) => {
    const c = KINDS[e.kind];
    const a = alphaOf(e);
    col.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], k * 8);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 4)); // 4 = vertexAlphas
  return g;
}
function disposeLines(obj) {
  if (!obj) return;
  group.remove(obj);
  obj.geometry.dispose();
  obj.material.dispose();
}
function buildEdgeLines(list) {
  disposeLines(edgeLines);
  edgeLines = null;
  if (!list.length) {
    syncEdges();
    return;
  }
  // Opacité croissante avec la force du lien : le bruit visuel recule,
  // les vraies similarités ressortent.
  edgeLines = new THREE.LineSegments(
    edgeGeometry(list, (e) => 0.08 + 0.62 * e.strength),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
  );
  edgeLines.frustumCulled = false;
  edgeLines.visible = layout === "force";
  group.add(edgeLines);
  syncEdges();
}
function buildHoverLines(i) {
  disposeLines(hoverLines);
  hoverLines = null;
  hoverLinesFor = i;
  hoverEdgeList = [];
  if (i === null || !meshes[i] || !meshes[i].visible) return;
  hoverEdgeList = shownEdges.filter((e) => e.a === i || e.b === i);
  if (!hoverEdgeList.length) return;
  hoverLines = new THREE.LineSegments(
    edgeGeometry(hoverEdgeList, () => 0.95),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
  );
  hoverLines.frustumCulled = false;
  hoverLines.visible = layout === "force";
  group.add(hoverLines);
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

function writePositions(obj, list) {
  if (!obj) return;
  const pos = obj.geometry.attributes.position;
  list.forEach((e, k) => {
    const a = meshes[e.a].position;
    const b = meshes[e.b].position;
    pos.setXYZ(k * 2, a.x, a.y, a.z);
    pos.setXYZ(k * 2 + 1, b.x, b.y, b.z);
  });
  pos.needsUpdate = true;
}
function syncEdges() {
  writePositions(edgeLines, shownEdges);
  writePositions(hoverLines, hoverEdgeList);
}

// ---------- force-directed (Fruchterman-Reingold, vitesse plafonnée) ----------
let temperature = 0.5;
const disp = new Float32Array(meshes.length * 3);
function resim() {
  temperature = 0.6;
  framed = false; // on recadrera une fois la simulation posée
}
document.getElementById("resim").onclick = resim;

const REP_K = 7;
const ATT = 0.02;
const GRAV = 1.4;
const MAX_STEP = 3;
function physicsStep() {
  if (temperature < 0.02) {
    temperature = 0;
    return;
  }
  const n = meshes.length;
  disp.fill(0);
  for (let i = 0; i < n; i++) {
    if (!meshes[i].visible) continue;
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
  for (const e of physEdges) {
    if (!meshes[e.a].visible || !meshes[e.b].visible) continue;
    const a = meshes[e.a].position;
    const b = meshes[e.b].position;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
    const f = ((d * d) / REP_K) * ATT * (0.3 + e.sim) * temperature / d;
    disp[e.a * 3] += dx * f; disp[e.a * 3 + 1] += dy * f; disp[e.a * 3 + 2] += dz * f;
    disp[e.b * 3] -= dx * f; disp[e.b * 3 + 1] -= dy * f; disp[e.b * 3 + 2] -= dz * f;
  }
  if (tagClouds) {
    for (const e of TAGPAIRS) {
      if (!meshes[e.a].visible || !meshes[e.b].visible) continue;
      const a = meshes[e.a].position;
      const b = meshes[e.b].position;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
      const f = (((d * d) / REP_K) * ATT * e.w * temperature) / d;
      disp[e.a * 3] += dx * f; disp[e.a * 3 + 1] += dy * f; disp[e.a * 3 + 2] += dz * f;
      disp[e.b * 3] -= dx * f; disp[e.b * 3 + 1] -= dy * f; disp[e.b * 3 + 2] -= dz * f;
    }
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
  if (temperature < 0.02) {
    temperature = 0;
    if (!framed) {
      framed = true;
      frameView();
    }
  }
}

// ---------- cadrage de la vue ----------
// Le layout force s'étale selon les données et le hasard des positions
// initiales : sans recadrage, la caméra (distance fixe) se retrouve
// parfois à l'intérieur du graphe.
let framed = false;
const TOP_DIR = new THREE.Vector3(0, 0.85, 0.55).normalize(); // plongée pour les layouts plats
function frameView() {
  const pts = meshes.filter((m) => m.visible).map((m) => m.position);
  if (!pts.length) return;
  // Centre = centroïde, rayon = 85e percentile : les nœuds isolés aux
  // quatre coins ne peuvent pas faire reculer la caméra.
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  c.divideScalar(pts.length);
  const ds = pts.map((p) => p.distanceTo(c)).sort((a, b) => a - b);
  const r = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.85))] || 10;
  // FOV 60° : d ≈ R / tan(30°) ≈ 1.73 R pour que R tienne dans le cadre.
  const dist = Math.max(16, r * 1.8);
  ctl.target.copy(c);
  // Temps et anneaux sont des disques plats : vus de tranche, ils se
  // confondent — on passe en plongée. Le layout libre garde l'axe courant.
  const dir = layout === "force" ? cam.position.clone().sub(c) : TOP_DIR.clone();
  if (dir.lengthSq() < 1e-6) dir.set(0, 0.35, 1); // caméra au hasard si centrée
  cam.position.copy(c).add(dir.normalize().multiplyScalar(dist));
  // Le brouillard suit le cadrage : mêmes repères de profondeur partout.
  scene.fog.near = dist * 0.7;
  scene.fog.far = dist * 2.4;
}
document.getElementById("reframe").onclick = frameView;

// ---------- layouts : temps (récent au centre) et anneaux (sensibilité) ----------
const SENS_RANK = { public: 0, personal: 1, private: 2, restricted: 3 };
const RING_R = [6, 11, 16, 21];
const times = MEM.map((m) => Date.parse(m.createdAt) || 0);
const tMin = Math.min(...times);
const tMax = Math.max(...times, tMin + 1);
function layoutTargets() {
  if (layout === "time") {
    return MEM.map((m, i) => {
      const t = Date.parse(m.createdAt) || tMin;
      const age = (t - tMin) / (tMax - tMin); // 0 = ancien, 1 = récent
      const r = 3 + (1 - age) * 19; // récent au centre
      const a = i * 2.399963;
      return { x: Math.cos(a) * r, y: ((i * 37) % 9 - 4) * 0.7, z: Math.sin(a) * r };
    });
  }
  // anneaux : un anneau par sensibilité (public au centre).
  return MEM.map((m, i) => {
    const ring = RING_R[SENS_RANK[m.sensitivity] !== undefined ? SENS_RANK[m.sensitivity] : 1];
    const a = i * 2.399963;
    return { x: Math.cos(a) * ring, y: ((i * 53) % 7 - 3) * 0.8, z: Math.sin(a) * ring };
  });
}

// ---------- état / filtres ----------
let layout = "force";
let hiddenTypes = new Set();
let hiddenScopes = new Set();
let showForg = true;
let query = "";
let selected = null; // index du nœud sélectionné (isole nœud + voisins)
let hover = null; // index survolé (surbrillance des arêtes + étiquette)

function visible(p) {
  if (hiddenTypes.has(p.type)) return false;
  if (hiddenScopes.has(p.scope)) return false;
  if (p.status === "forgotten" && !showForg) return false;
  return true;
}
function neighborSet(i) {
  const out = new Set();
  for (const e of EDGES) {
    if (e.a === i) out.add(e.b);
    else if (e.b === i) out.add(e.a);
  }
  return out;
}
// Taille = forme d'origine × degré (les hubs se repèrent d'un coup d'œil)
// × mise en avant (recherche / sélection).
function applyScales() {
  meshes.forEach((m) => {
    const i = m.userData.i;
    let s = 1 + 0.3 * Math.min(3.5, Math.sqrt(DEG[i])); // x1 → x2.05 max
    if (m.userData.hit) s *= 1.7;
    if (selected === i) s *= 1.8;
    m.scale.setScalar(s);
  });
}
// Opacité : 1 = opaque (depthWrite, pas d'artefact d'ordre de rendu),
// < 1 = transparent vraiment utile (oublié, estompé, recherche).
function setOpacity(m, op) {
  m.material.opacity = op;
  const tr = op < 0.999;
  if (m.material.transparent !== tr) {
    m.material.transparent = tr;
    m.material.depthWrite = !tr;
    m.material.needsUpdate = true;
  }
}
function refresh() {
  let n = 0;
  const nb = selected === null ? null : neighborSet(selected);
  meshes.forEach((m) => {
    const p = MEM[m.userData.i];
    const v = visible(p);
    m.visible = v;
    if (v) n++;
    const hit = query && (p.content + " " + (p.summary || "") + " " + (p.tags || []).join(" ")).toLowerCase().includes(query);
    m.userData.hit = !!hit;
    let op = 1;
    if (p.status === "forgotten") op = 0.3;
    else if (query && !hit) op = 0.25;
    // Sélection : tout le reste s'efface presque, le nœud et ses voisins restent.
    if (nb && selected !== m.userData.i && !nb.has(m.userData.i)) op = Math.min(op, 0.12);
    setOpacity(m, op);
  });
  applyScales();
  if (edgeLines) edgeLines.visible = layout === "force";
  if (hoverLines) hoverLines.visible = layout === "force";
  updateShownEdges();
  document.getElementById("count").textContent = n + " / " + MEM.length + " visibles";
}

// ---------- étiquettes 2D (survol, sélection, hubs) ----------
// Projection HTML : pas d'objet 3D, donc coût quasi nul. N'affiche que ce
// qui compte — nœud survolé, nœud sélectionné + ses voisins, sinon les hubs.
const labelHost = document.createElement("div");
labelHost.id = "labels";
document.body.appendChild(labelHost);
const labelEls = new Map(); // i -> div
const HUB_LABELS = 5;
function labelKeyFor(set) {
  return Array.from(set).sort((a, b) => a - b).join(",");
}
function labelText(i) {
  const p = MEM[i];
  const t = (p.summary || p.content || "").replace(/\s+/g, " ").trim();
  const s = t.length > 46 ? t.slice(0, 46) + "…" : t;
  return (TYPE_FR[p.type] || p.type) + " · " + s;
}
function labelSet() {
  const set = new Set();
  if (selected !== null) {
    set.add(selected);
    for (const j of neighborSet(selected)) if (meshes[j].visible) set.add(j);
  } else {
    for (let k = 0; k < HUB_LABELS && k < hubs.length; k++) if (meshes[hubs[k]].visible) set.add(hubs[k]);
  }
  if (hover !== null) set.add(hover);
  return set;
}
let labelKey = "";
function syncLabels() {
  const set = labelSet();
  const key = labelKeyFor(set);
  if (key !== labelKey) {
    labelKey = key;
    for (const [i, el] of Array.from(labelEls)) {
      if (set.has(i)) continue;
      el.remove();
      labelEls.delete(i);
    }
    for (const i of set) {
      if (labelEls.has(i)) continue;
      const el = document.createElement("div");
      el.textContent = labelText(i);
      labelHost.appendChild(el);
      labelEls.set(i, el);
    }
  }
  // Classes toujours réappliquées : survoler un hub déjà étiqueté doit
  // passer la pastille en "hot" même si le jeu d'étiquettes n'a pas bougé.
  for (const [i, el] of labelEls) {
    el.className =
      "lab" +
      (selected === null && i !== hover ? " hub" : "") +
      (i === selected ? " sel" : "") +
      (i === hover ? " hot" : "");
  }
}
const _pv = new THREE.Vector3();
function updateLabels() {
  syncLabels();
  if (!labelEls.size) return;
  group.updateMatrixWorld();
  // 1) projection écran
  const shown = [];
  for (const [i, el] of labelEls) {
    const m = meshes[i];
    if (!m.visible) {
      el.style.display = "none";
      continue;
    }
    _pv.copy(m.position).applyMatrix4(group.matrixWorld).project(cam);
    if (_pv.z > 1) {
      el.style.display = "none"; // derrière la caméra
      continue;
    }
    el.style.display = "block";
    el._x = (_pv.x * 0.5 + 0.5) * innerWidth;
    el._y = (_pv.y * -0.5 + 0.5) * innerHeight;
    shown.push(el);
  }
  // 2) désencombrement : on empile vers le bas celles qui se recouvrent
  // (ordre trié et déterministe → pas de scintillement à l'arrêt).
  shown.sort((a, b) => a._y - b._y || a._x - b._x);
  const placed = [];
  for (const el of shown) {
    let y = el._y;
    for (let guard = 0; guard < 6; guard++) {
      const clash = placed.find((p) => Math.abs(p.x - el._x) < 230 && Math.abs(p.y - y) < 17);
      if (!clash) break;
      y += 17;
    }
    placed.push({ x: el._x, y });
    el.style.transform = `translate(-50%,-130%) translate(${el._x.toFixed(1)}px,${y.toFixed(1)}px)`;
  }
}

// ---------- picking / détail ----------
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = document.getElementById("tip");
const detail = document.getElementById("detail");

function pickTargets() {
  return meshes.filter((m) => m.visible);
}
function pick(e) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, cam);
  return ray.intersectObjects(pickTargets())[0];
}
ren.domElement.addEventListener("pointermove", (e) => {
  const hit = pick(e);
  const i = hit ? hit.object.userData.i : null;
  if (i !== hover) {
    hover = i;
    updateShownEdges();
  }
  if (hit) {
    const p = MEM[hit.object.userData.i];
    tip.style.display = "block";
    tip.style.left = e.clientX + 14 + "px";
    tip.style.top = e.clientY + 10 + "px";
    tip.innerHTML = "<b>" + (TYPE_FR[p.type] || p.type) + "</b> · " + escapeHtml(shortScope(p.scope)) + "<br>" + escapeHtml(p.content.slice(0, 140)) + "…";
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
function select(i) {
  selected = i;
  refresh();
  showDetail(i);
}
function deselect() {
  selected = null;
  detail.style.display = "none";
  refresh();
}
addEventListener("keydown", (e) => {
  if (e.key === "Escape") deselect();
});
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
    `<h2><span>${TYPE_FR[p.type] || p.type} <span style="color:${BRANCH_COLORS[branchOf(p.scope)]}">●</span></span><button id="detailClose" title="désélectionner (Échap)">✕</button></h2>` +
    `<div class="meta">${p.shortId} · ${p.status} · ${p.sensitivity} · ${p.sourceTrust}<br>scope: ${escapeHtml(p.scope)}<br>créé: ${(p.createdAt || "").slice(0, 10)}${p.summary ? "<br>résumé: " + escapeHtml(p.summary) : ""}${p.tags.length ? "<br>tags: " + escapeHtml(p.tags.join(", ")) : ""}</div>` +
    `<p>${escapeHtml(p.content)}</p>` +
    rel(neighborsOf(i), "voisins proches") +
    rel(sibs.map(({ j }) => ({ i: j })), "même scope");
  detail.querySelector("#detailClose").onclick = deselect;
  detail.querySelectorAll("button[data-i]").forEach((b) => {
    b.onclick = () => {
      const j = Number(b.dataset.i);
      select(j);
      focusNode(j);
    };
  });
}
function focusNode(j) {
  ctl.target.copy(meshes[j].position);
}
ren.domElement.addEventListener("click", (e) => {
  const hit = pick(e);
  if (!hit) {
    deselect();
    return;
  }
  select(hit.object.userData.i);
});

// ---------- légendes / contrôles ----------
const leg = document.getElementById("legend");
Object.keys(BRANCH_COLORS).forEach((b) => {
  const n = MEM.filter((p) => branchOf(p.scope) === b).length;
  const d = document.createElement("span");
  d.className = "chip";
  d.style.borderColor = BRANCH_COLORS[b];
  d.innerHTML = `<span class="dot" style="background:${BRANCH_COLORS[b]}"></span>${b} (${n})`;
  leg.appendChild(d);
});
Object.keys(TYPE_GEO).forEach((t) => {
  const n = MEM.filter((p) => p.type === t).length;
  const d = document.createElement("span");
  d.className = "chip";
  d.innerHTML = `${TYPE_FR[t] || t} (${n})`;
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
      d.innerHTML = `<span class="chip"><span class="dot" style="background:${BRANCH_COLORS[branchOf(s)]}"></span>${escapeHtml(shortScope(s))} (${n})</span>`;
      const chip = d.querySelector(".chip");
      chip.onclick = () => {
        hiddenScopes.has(s) ? hiddenScopes.delete(s) : hiddenScopes.add(s);
        chip.classList.toggle("off");
        refresh();
      };
      scBox.appendChild(d);
    });
}
document.getElementById("search").oninput = (e) => {
  query = e.target.value.trim().toLowerCase();
  refresh();
};
document.getElementById("showForg").onchange = (e) => {
  showForg = e.target.checked;
  refresh();
};
document.getElementById("showHubs").onchange = (e) => {
  tagClouds = e.target.checked;
  resim();
};

// ---------- layouts ----------
function setLayout(l) {
  layout = l;
  for (const id of ["lForce", "lTime", "lRings"]) document.getElementById(id).classList.remove("on");
  document.getElementById(l === "force" ? "lForce" : l === "time" ? "lTime" : "lRings").classList.add("on");
  if (l === "force") {
    resim();
  } else {
    // Les nœuds convergent vers leurs cibles en ~1s : on cadre après.
    setTimeout(frameView, 1000);
  }
  refresh();
}
document.getElementById("lForce").onclick = () => setLayout("force");
document.getElementById("lTime").onclick = () => setLayout("time");
document.getElementById("lRings").onclick = () => setLayout("rings");

// ---------- menu scopes (tiroir Miller) ----------
const drawer = document.getElementById("drawer");
function setDrawer(open) {
  drawer.style.display = open ? "flex" : "none";
  document.getElementById("mScopes").classList.toggle("on", open);
  if (open) renderMiller();
}
document.getElementById("mScopes").onclick = () => setDrawer(drawer.style.display !== "flex");
document.getElementById("drawerClose").onclick = () => setDrawer(false);

function memButton(m) {
  return `<div class="item" data-id="${m.shortId}">${escapeHtml((m.summary || m.content).slice(0, 60))}… <span class="n">${TYPE_FR[m.type] || m.type} · ${m.status === "forgotten" ? "oublié" : "actif"}</span></div>`;
}
function renderMiller() {
  const miller = document.getElementById("millercols");
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
          el.firstChild.onclick = () => {
        const j = indexById.get(m.shortId);
        select(j);
        focusNode(j);
      };
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
let blend = 0;
const _tmpV = new THREE.Vector3();
document.getElementById("spin").checked = false;
computeEdges();
refresh();
(function anim() {
  requestAnimationFrame(anim);
  if (document.hidden) return;
  if (layout === "force") {
    if (blend > 0) blend = Math.max(0, blend - 0.03);
    physicsStep();
  } else {
    if (blend < 1) blend = Math.min(1, blend + 0.03);
    const targets = layoutTargets();
    _tmpV.set(0, 0, 0);
    meshes.forEach((m, i) => {
      const t = targets[i];
      _tmpV.set(t.x, t.y, t.z);
      m.position.lerp(_tmpV, 0.06 * blend + 0.001);
    });
    syncEdges();
  }
  if (document.getElementById("spin").checked) group.rotation.y += 0.0016;
  ctl.update();
  updateLabels();
  updateHalo(performance.now());
  ren.render(scene, cam);
})();

// Hook console / debug : ATLAS.select(12), ATLAS.setLayout("rings")…
window.ATLAS = {
  select,
  deselect,
  setLayout,
  refresh,
  focusNode,
  frameView,
  get hubs() {
    return hubs;
  },
};
