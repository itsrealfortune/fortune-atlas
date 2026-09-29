/**
 * Vecteurs : décodage blob (v1 Float32 / legacy Float64), cosinus,
 * k-plus-proches-voisins (arêtes du graphe), PCA légère pour le layout initial.
 */

export function decodeVectorBlob(raw: Uint8Array): number[] | null {
  if (raw.byteLength === 0) return null;
  if (raw[0] === 1 && (raw.byteLength - 1) % 4 === 0) {
    const count = (raw.byteLength - 1) / 4;
    const aligned = new Uint8Array(count * 4);
    aligned.set(raw.subarray(1));
    return Array.from(
      new Float32Array(aligned.buffer, aligned.byteOffset, count),
    );
  }
  if (raw.byteLength % 8 === 0) {
    const count = raw.byteLength / 8;
    const aligned = new Uint8Array(count * 8);
    aligned.set(raw);
    return Array.from(
      new Float64Array(aligned.buffer, aligned.byteOffset, count),
    );
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Edge {
  a: number;
  b: number;
  sim: number;
}

/**
 * k-NN symétrisé : pour chaque point, ses k voisins les plus similaires
 * (cosinus >= minSim). Retourne des arêtes uniques (a < b).
 */
export function kNearestEdges(
  vectors: (number[] | null)[],
  k = 3,
  minSim = 0.15,
): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (let i = 0; i < vectors.length; i++) {
    const vi = vectors[i];
    if (!vi) continue;
    const scored: { j: number; sim: number }[] = [];
    for (let j = 0; j < vectors.length; j++) {
      if (i === j || !vectors[j]) continue;
      const sim = cosineSimilarity(vi, vectors[j]!);
      if (sim >= minSim) scored.push({ j, sim });
    }
    scored.sort((x, y) => y.sim - x.sim);
    for (const { j, sim } of scored.slice(0, k)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: Math.min(i, j), b: Math.max(i, j), sim });
    }
  }
  return edges;
}
