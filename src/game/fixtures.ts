import type { MatchState } from "./schema";

const player = { name: "神谷 隼人", description: "熱血のベビーフェイス", hp: 5, maxHp: 5 };
const enemy = { name: "黒鉄 大五郎", description: "圧倒的な巨漢のヒール", hp: 5, maxHp: 5 };
const strike = { name: "ミドルキック", category: "strike", grade: "normal" } as const;

export const sampleState: MatchState = {
  setting: { time: "真夏の夜", place: "地方の体育館", enemyType: "giant", playerSignature: null },
  player,
  enemy,
  turn: 1,
  status: "in_progress",
  pendingEnemy: strike,
  enemyHistory: [],
  winner: null,
  finish: null,
  log: [
    {
      turn: 0,
      enemyTable: { throw: 40, submission: 20, strike: 20, aerial: 20 },
      enemyAction: strike,
      playerInput: "ミドルキックで応戦する",
      playerAction: strike,
      result: { affinityWinner: null, attempts: [], player, enemy, winner: null },
    },
  ],
};
