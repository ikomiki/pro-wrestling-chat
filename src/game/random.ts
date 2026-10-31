import { randomInt } from "node:crypto";

export type Rng = (max: number) => number;

export const cryptoRng: Rng = (max) => randomInt(max);

export function weightedPick<T>(
  table: { value: T; weight: number }[],
  rng: Rng,
): { value: T; roll: number } {
  const weights = table.map((t) => Math.round(t.weight * 100));
  const roll = rng(weights.reduce((a, b) => a + b, 0));
  let acc = 0;
  for (let i = 0; i < table.length; i++) {
    acc += weights[i];
    if (roll < acc) return { value: table[i].value, roll };
  }
  throw new Error("weightedPick: roll out of range");
}

export function chance(percent: number, rng: Rng): { ok: boolean; roll: number } {
  const roll = rng(100);
  return { ok: roll < percent, roll };
}

export function queueRng(values: number[]): Rng {
  const q = [...values];
  return () => {
    const v = q.shift();
    if (v === undefined) throw new Error("queueRng exhausted");
    return v;
  };
}
