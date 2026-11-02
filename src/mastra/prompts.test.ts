import { test, expect } from "bun:test";
import { sampleState } from "../game/fixtures";
import type { TurnLog } from "../game/schema";
import { eventsText, resultPrompt, scenePrompt } from "./prompts";

const base = sampleState.log[0];
const withResult = (result: Partial<TurnLog["result"]>): TurnLog[] => [{ ...base, result: { ...base.result, ...result } }];

test("eventsText はターンごとに決まった/外れたを 1 行にする", () => {
  const log = withResult({
    attempts: [
      { side: "enemy", rate: 0.5, roll: 0.1, hit: true },
      { side: "player", rate: 0.5, roll: 0.9, hit: false },
    ],
  });
  expect(eventsText(log)).toEqual(["敵のミドルキックが決まった / プレイヤーのミドルキックは外れた"]);
});

test("相性で潰された技はそう書く", () => {
  const log = withResult({ affinityWinner: "enemy", attempts: [{ side: "enemy", rate: 0.5, roll: 0.1, hit: true }] });
  expect(eventsText(log)[0]).toContain("プレイヤーのミドルキックは相性で潰された");
});

test("過去の行にはプレイヤーの入力文ではなく分類後の技名を使う", () => {
  expect(eventsText(sampleState.log)[0]).not.toContain(base.playerInput);
});

test("narrator のプロンプトは状況リストを含み、数値と過去の文章を含まない", () => {
  const p = scenePrompt(sampleState, sampleState.pendingEnemy!);
  expect(p).toContain("## いまの状況");
  expect(p).toContain(sampleState.situation.crowd);
  expect(p).toContain(sampleState.situation.enemyPlan);
  expect(p).not.toContain("直前の描写");
  expect(p).not.toMatch(/\d+\s*\/\s*\d+/);
});

test("結果のプロンプトはそのターンを出来事に重複させず、入力文を描くことに入れる", () => {
  const p = resultPrompt(sampleState, base);
  expect(p).toContain("## この場面で描くこと");
  expect(p).toContain(base.playerInput);
  expect(p.split("## これまでの出来事")[1].split("## この場面で描くこと")[0]).not.toContain("ミドルキック");
  expect(p).not.toMatch(/\d+\s*\/\s*\d+/);
});
