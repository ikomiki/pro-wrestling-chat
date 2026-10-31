import type { Category } from "./types";

export const CATEGORY_FLOOR = 10;
export const REPEAT_FACTOR = 0.5;

export function sanitizeWeights<K extends string>(raw: Record<K, number>): Record<K, number> {
  const keys = Object.keys(raw) as K[];
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = Number.isFinite(raw[k]) && raw[k] > 0 ? raw[k] : 0;
  if (keys.every((k) => out[k] === 0)) for (const k of keys) out[k] = 1;
  return out;
}

export function adjustCategoryTable(
  raw: Record<Category, number>,
  last: Category | null,
): Record<Category, number> {
  const clean = sanitizeWeights(raw);
  const keys = Object.keys(clean) as Category[];
  const total = keys.reduce((s, k) => s + clean[k], 0);
  const out = {} as Record<Category, number>;
  for (const k of keys) {
    const v = (clean[k] / total) * 100 * (k === last ? REPEAT_FACTOR : 1);
    out[k] = Math.max(v, CATEGORY_FLOOR);
  }
  return out;
}
