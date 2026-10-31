import { test, expect } from "bun:test";
import { adjustCategoryTable, sanitizeWeights, CATEGORY_FLOOR } from "./enemy-table";

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
test("直前と同じ種類は半分になる", () => {
  const t = adjustCategoryTable({ throw: 60, submission: 20, strike: 10, aerial: 10 }, "throw");
  expect(t.throw).toBe(30);
  expect(t.submission).toBe(20);
});
