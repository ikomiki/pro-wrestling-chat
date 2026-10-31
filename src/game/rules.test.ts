import { test, expect } from "bun:test";
import { queueRng } from "./random";
import { beats, successRate, resolveTurn } from "./rules";
import type { Action, Fighter, Grade } from "./types";

const f = (hp: number): Fighter => ({ name: "x", description: "", hp, maxHp: 5 });
const act = (category: Action["category"], grade: Grade = "normal"): Action => ({ name: "技", category, grade });

test("相性", () => {
  expect(beats("throw", "strike")).toBe(true);
  expect(beats("strike", "submission")).toBe(true);
  expect(beats("submission", "throw")).toBe(true);
  expect(beats("strike", "throw")).toBe(false);
  expect(beats("aerial", "throw")).toBe(false);
  expect(beats("throw", "aerial")).toBe(false);
});
test("成功率は受ける側の残り体力で決まる", () => {
  expect([5, 4].map(hp => successRate("finisher", f(hp)))).toEqual([20, 20]);
  expect([3, 2].map(hp => successRate("big", f(hp)))).toEqual([70, 70]);
  expect(successRate("normal", f(1))).toBe(100);
});
test("相性勝ちの側だけ判定し、命中で相手にダメージ", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("throw", "big"), enemyAction: act("strike") }, queueRng([0]));
  expect(r.affinityWinner).toBe("player");
  expect(r.attempts).toHaveLength(1);
  expect(r.enemy.hp).toBe(3);
  expect(r.player.hp).toBe(5);
});
test("相性勝ちでも外れればダメージなし", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("throw", "finisher"), enemyAction: act("strike") }, queueRng([20]));
  expect(r.enemy.hp).toBe(5);
  expect(r.player.hp).toBe(5);
});
test("同じ種類は双方判定、両方命中で相打ち", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("strike"), enemyAction: act("strike", "big") }, queueRng([0, 0]));
  expect(r.attempts.map(a => a.side)).toEqual(["player", "enemy"]);
  expect([r.player.hp, r.enemy.hp]).toEqual([3, 4]);
});
test("飛び技が絡むと双方判定", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("aerial"), enemyAction: act("throw") }, queueRng([99, 0]));
  expect(r.affinityWinner).toBeNull();
  expect([r.player.hp, r.enemy.hp]).toEqual([4, 5]);
});
test("技なしは敵だけ判定", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("none"), enemyAction: act("throw") }, queueRng([0]));
  expect(r.attempts).toEqual([expect.objectContaining({ side: "enemy", hit: true })]);
  expect(r.player.hp).toBe(4);
});
test("体力は 0 で止まり、勝者が決まる", () => {
  const r = resolveTurn({ player: f(5), enemy: f(1), playerAction: act("throw", "finisher"), enemyAction: act("strike") }, queueRng([0]));
  expect(r.enemy.hp).toBe(0);
  expect(r.winner).toBe("player");
});
test("同時に 0 なら rng(2) で勝者", () => {
  const input = { player: f(1), enemy: f(1), playerAction: act("strike"), enemyAction: act("strike") };
  expect(resolveTurn(input, queueRng([0, 0, 0])).winner).toBe("player");
  expect(resolveTurn(input, queueRng([0, 0, 1])).winner).toBe("enemy");
});
