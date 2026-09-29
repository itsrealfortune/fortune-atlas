/**
 * Accès lecture seule au vault sqlite (WAL-safe : ne bloque jamais le bot).
 * Chemin : FORTUNE_ATLAS_DB > ../clone/data/fortunememories.db.
 */
import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeVectorBlob } from "./vectors.ts";

const here = dirname(fileURLToPath(import.meta.url));

export function resolveDbPath(): string {
  if (process.env.FORTUNE_ATLAS_DB) return process.env.FORTUNE_ATLAS_DB;
  return join(here, "..", "..", "..", "clone", "data", "fortunememories.db");
}

export interface VaultMemory {
  id: string;
  shortId: string;
  type: string;
  scope: string;
  sensitivity: string;
  sourceTrust: string;
  status: string;
  summary: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  forgottenAt: string | null;
  contentHash: string | null;
  vector: number[] | null;
}

const COLUMNS = `id, type, scope, sensitivity, source_trust, status, summary,
  content, tags, created_at, updated_at, forgotten_at, content_hash, vector_blob`;

function rowToMemory(row: Record<string, unknown>): VaultMemory {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(String(row.tags ?? "[]"));
    if (Array.isArray(parsed)) tags = parsed.map(String);
  } catch {
    tags = [];
  }
  const blob = row.vector_blob as Uint8Array | null;
  return {
    id: String(row.id),
    shortId: String(row.id).slice(0, 8),
    type: String(row.type),
    scope: String(row.scope ?? "personal"),
    sensitivity: String(row.sensitivity ?? "personal"),
    sourceTrust: String(row.source_trust ?? "external"),
    status: String(row.status ?? "active"),
    summary: String(row.summary ?? ""),
    content: String(row.content ?? ""),
    tags,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    forgottenAt: row.forgotten_at ? String(row.forgotten_at) : null,
    contentHash: row.content_hash ? String(row.content_hash) : null,
    vector: blob ? decodeVectorBlob(new Uint8Array(blob)) : null,
  };
}

export function loadVault(dbPath = resolveDbPath()): VaultMemory[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(`SELECT ${COLUMNS} FROM fortune_memories`)
      .all() as Record<string, unknown>[];
    return rows.map(rowToMemory);
  } finally {
    db.close();
  }
}
