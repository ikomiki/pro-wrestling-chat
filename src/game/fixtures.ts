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
  situation: {
    crowd: "満員の観客が巨漢の入場にどよめいている",
    position: "リング中央で向かい合っている",
    momentum: "まだどちらにも傾いていない",
    playerMind: "体格差に気圧されつつも闘志を燃やしている",
    playerPlan: "打撃で足を止めてから勝負に出たい",
    enemyMind: "小柄な相手を見下して余裕を見せている",
    enemyPlan: "力で押し込んで早めに潰す",
  },
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
