import { test, expect } from "bun:test";
import { weightedPick, chance, cryptoRng, queueRng } from "./random";

test("weightedPick は累積重みで選ぶ", () => {
  const table = [{ value: "a", weight: 1 }, { value: "b", weight: 3 }];
  expect(weightedPick(table, queueRng([0])).value).toBe("a");
  expect(weightedPick(table, queueRng([99])).value).toBe("a");
  expect(weightedPick(table, queueRng([100])).value).toBe("b");
  expect(weightedPick(table, queueRng([399])).value).toBe("b");
});
test("重み 0 の候補は選ばれない", () => {
  const table = [{ value: "a", weight: 0 }, { value: "b", weight: 1 }];
  expect(weightedPick(table, queueRng([0])).value).toBe("b");
});
test("chance は roll < percent で成功", () => {
  expect(chance(90, queueRng([89])).ok).toBe(true);
  expect(chance(90, queueRng([90])).ok).toBe(false);
  expect(chance(100, queueRng([99])).ok).toBe(true);
});
test("cryptoRng は範囲内", () => {
  for (let i = 0; i < 100; i++) { const n = cryptoRng(4); expect(n >= 0 && n < 4).toBe(true); }
});
