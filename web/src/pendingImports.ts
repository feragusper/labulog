// Rows the importer skipped (duplicates/conflicts) wait here between the
// Settings import and the Applications review UI. localStorage keeps them
// across the navigation and reloads until the user adds or discards each one.
import type { PendingRow } from "./api";

const KEY = "labulog_pending_imports";
const EVENT = "labulog:pending-imports";

function keyOf(r: PendingRow): string {
  return `${r.posting.url ?? ""}|${r.posting.company_name}|${r.posting.title}`;
}

export function getPendingImports(): PendingRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingRow[]) : [];
  } catch {
    return [];
  }
}

function save(rows: PendingRow[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(EVENT));
}

/** Merge new pending rows in, de-duped by posting, and return the full list. */
export function addPendingImports(rows: PendingRow[]): PendingRow[] {
  const existing = getPendingImports();
  const seen = new Set(existing.map(keyOf));
  const merged = [...existing];
  for (const r of rows) {
    if (!seen.has(keyOf(r))) { merged.push(r); seen.add(keyOf(r)); }
  }
  save(merged);
  return merged;
}

export function removePendingImport(row: PendingRow): PendingRow[] {
  const next = getPendingImports().filter((r) => keyOf(r) !== keyOf(row));
  save(next);
  return next;
}

export function clearPendingImports() {
  save([]);
}

/** Subscribe to pending-list changes (same-tab writes + cross-tab storage). */
export function onPendingImportsChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
