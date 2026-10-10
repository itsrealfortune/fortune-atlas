/**
 * Vecteurs : décodage blob (v1 Float32 / legacy Float64).
 * La similarité (cosinus + Jaccard) est calculée côté client dans
 * public/app.js, où vivent les curseurs de seuil qui l'utilisent.
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
