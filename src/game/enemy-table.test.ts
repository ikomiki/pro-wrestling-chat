import { test, expect } from "bun:test";
import { adjustCategoryTable, normalizeWeights, sanitizeWeights, CATEGORY_FLOOR } from "./enemy-table";
import { queueRng, weightedPick } from "./random";

const all = (n: number) => ({ throw: n, submission: n, strike: n, aerial: n });

test("全部 0 なら均等", () => {
  expect(adjustCategoryTable(all(0), null)).toEqual(all(25));
});
test("負数・NaN は 0 扱い", () => {
  expect(sanitizeWeights({ a: -3, b: Number.NaN, c: 2 })).toEqual({ a: 0, b: 0, c: 2 });
});
test("どの種類も下限を下回らない", () => {
  const t = adjustCategoryTable({ throw: 100, submission: 0, strike: 0, aerial: 0 }, null);
  for (const v of Object.values(t)) expect(v).toBeGreaterThanOrEqual(CATEGORY_FLOOR);
});
test("直前と同じ種類は 1/4 になる", () => {
  const t = adjustCategoryTable({ throw: 60, submission: 20, strike: 10, aerial: 10 }, "throw");
  expect(t.throw).toBe(15);
  expect(t.submission).toBe(20);
});
test("極端に小さい・大きい重みも合計 100 にそろえて抽選できる", () => {
  for (const raw of [
    { normal: 1e-6, big: 1e-6, finisher: 2e-6 },
    { normal: 1e300, big: 1e300, finisher: 2e300 },
  ]) {
    const t = normalizeWeights(raw);
    expect(t.normal + t.big + t.finisher).toBeCloseTo(100);
    expect(t.finisher).toBeCloseTo(50);
    const table = Object.entries(t).map(([value, weight]) => ({ value, weight }));
    expect(weightedPick(table, queueRng([9999])).value).toBe("finisher");
  }
});
