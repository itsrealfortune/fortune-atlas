/**
 * Scopes POSIX : "global/thinking", "discord/dm/123", "personal"...
 * Déclinaison en arbre : chaque segment est un nœud, chaque scope
 * complet une feuille qui porte ses souvenirs.
 */

export interface ScopeNode {
  /** Segment (ex: "dm", "123", "thinking"). "" pour la racine. */
  name: string;
  /** Chemin complet depuis la racine ("discord/dm/123"). */
  path: string;
  children: Map<string, ScopeNode>;
  /** IDs (courts) des souvenirs scopés exactement ici. */
  memoryIds: string[];
}

export function splitScope(scope: string): string[] {
  return (scope || "personal").split("/").filter(Boolean);
}

/** Branche racine pour la couleur : "global" | "discord" | "personal" | autre. */
export function scopeBranch(scope: string): string {
  const head = splitScope(scope)[0] ?? "personal";
  if (head === "global" || head === "discord" || head === "personal") return head;
  return "other";
}

/** Libellé court : "discord/dm/123" -> "dm:123", "discord/456" -> "srv:456". */
export function shortScope(scope: string): string {
  return scope.replace(/^discord\/dm\//, "dm:").replace(/^discord\//, "srv:");
}

export function buildScopeTree(scopes: Map<string, string[]>): ScopeNode {
  const root: ScopeNode = { name: "", path: "", children: new Map(), memoryIds: [] };
  for (const [scope, ids] of scopes) {
    let node = root;
    let path = "";
    for (const seg of splitScope(scope)) {
      path = path ? `${path}/${seg}` : seg;
      let child = node.children.get(seg);
      if (!child) {
        child = { name: seg, path, children: new Map(), memoryIds: [] };
        node.children.set(seg, child);
      }
      node = child;
    }
    node.memoryIds.push(...ids);
  }
  return root;
}

/** Compte récursif des souvenirs sous un nœud (enfants inclus). */
export function countSubtree(node: ScopeNode): number {
  let n = node.memoryIds.length;
  for (const child of node.children.values()) n += countSubtree(child);
  return n;
}

/** Sérialisation JSON-friendly de l'arbre (pour l'API / le statique). */
export interface ScopeTreeJson {
  name: string;
  path: string;
  count: number;
  own: number;
  children: ScopeTreeJson[];
}

export function treeToJson(node: ScopeNode): ScopeTreeJson {
  return {
    name: node.name,
    path: node.path,
    count: countSubtree(node),
    own: node.memoryIds.length,
    children: [...node.children.values()]
      .sort((a, b) => countSubtree(b) - countSubtree(a))
      .map(treeToJson),
  };
}
