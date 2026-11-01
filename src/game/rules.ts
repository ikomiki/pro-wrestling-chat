import { chance, type Rng } from "./random";
import type { Action, Category, Fighter, Grade, Side } from "./types";

export const DAMAGE: Record<Grade, number> = { normal: 1, big: 2, finisher: 3 };

export type TurnResult = {
  affinityWinner: Side | null;
  attempts: { side: Side; rate: number; roll: number; hit: boolean }[];
  player: Fighter;
  enemy: Fighter;
  winner: Side | null;
};

export function beats(a: Category, b: Category): boolean {
  return (
    (a === "throw" && b === "strike") ||
    (a === "strike" && b === "submission") ||
    (a === "submission" && b === "throw")
  );
}

const RATES: Record<Grade, [number, number, number]> = {
  normal: [90, 95, 100],
  big: [50, 70, 90],
  finisher: [20, 45, 70],
};

export function successRate(grade: Grade, defender: Fighter): number {
  const ratio = defender.hp / defender.maxHp;
  return RATES[grade][ratio > 0.6 ? 0 : ratio > 0.3 ? 1 : 2];
}

export function resolveTurn(
  input: { player: Fighter; enemy: Fighter; playerAction: Action; enemyAction: Action },
  rng: Rng,
): TurnResult {
  const { player, enemy, playerAction: pa, enemyAction: ea } = input;
  const attackers: Side[] = [];
  let affinityWinner: Side | null = null;

  if (pa.category === "none") {
    attackers.push("enemy");
  } else if (
    ea.category !== "none" &&
    pa.category !== "aerial" &&
    ea.category !== "aerial" &&
    pa.category !== ea.category
  ) {
    affinityWinner = beats(pa.category, ea.category) ? "player" : "enemy";
    attackers.push(affinityWinner);
  } else {
    attackers.push("player", "enemy");
  }

  const attempts: TurnResult["attempts"] = [];
  let playerHp = player.hp;
  let enemyHp = enemy.hp;
  for (const side of attackers) {
    const action = side === "player" ? pa : ea;
    const defender = side === "player" ? enemy : player;
    const rate = successRate(action.grade, defender);
    const { ok, roll } = chance(rate, rng);
    attempts.push({ side, rate, roll, hit: ok });
    if (!ok) continue;
    if (side === "player") enemyHp = Math.max(0, enemyHp - DAMAGE[action.grade]);
    else playerHp = Math.max(0, playerHp - DAMAGE[action.grade]);
  }

  let winner: Side | null = null;
  if (playerHp === 0 && enemyHp === 0) winner = rng(2) === 0 ? "player" : "enemy";
  else if (enemyHp === 0) winner = "player";
  else if (playerHp === 0) winner = "enemy";

  return {
    affinityWinner,
    attempts,
    player: { ...player, hp: playerHp },
    enemy: { ...enemy, hp: enemyHp },
    winner,
  };
}
