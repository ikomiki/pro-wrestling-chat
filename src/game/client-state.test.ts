import { test, expect } from "bun:test";
import { toClientState } from "./client-state";
import { sampleState } from "./fixtures";

test("デバッグ OFF では敵の行動とログを送らない", () => {
  const c = toClientState({ ...sampleState, pendingEnemy: { name: "ラリアット", category: "strike", grade: "big" } }, false);
  expect("pendingEnemy" in c).toBe(false);
  expect("log" in c).toBe(false);
  expect(toClientState(sampleState, true).pendingEnemy).toEqual(sampleState.pendingEnemy);
});
