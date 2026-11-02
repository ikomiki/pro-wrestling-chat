import { z } from "zod";

const category = z.enum(["throw", "submission", "strike", "aerial"]);
const grade = z.enum(["normal", "big", "finisher"]);
const side = z.enum(["player", "enemy"]);

const text = z.string().max(500);
export const setupInputSchema = z.object({
  time: text,
  place: text,
  player: text,
  playerSignature: text,
  enemy: text,
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const actionSchema = z.object({
  name: z.string(),
  category: z.union([category, z.literal("none")]),
  grade,
});

export const fighterSchema = z.object({
  name: z.string(),
  description: z.string(),
  hp: z.number(),
  maxHp: z.number(),
});

export const turnLogSchema = z.object({
  turn: z.number(),
  enemyTable: z.record(category, z.number()),
  enemyAction: actionSchema,
  playerInput: z.string(),
  playerAction: actionSchema,
  result: z.object({
    affinityWinner: side.nullable(),
    attempts: z.array(
      z.object({ side, rate: z.number(), roll: z.number(), hit: z.boolean() }),
    ),
    player: fighterSchema,
    enemy: fighterSchema,
    winner: side.nullable(),
  }),
});
export type TurnLog = z.infer<typeof turnLogSchema>;

export const situationSchema = z.object({
  crowd: z.string(),
  position: z.string(),
  momentum: z.string(),
  playerMind: z.string(),
  playerPlan: z.string(),
  enemyMind: z.string(),
  enemyPlan: z.string(),
});
export type Situation = z.infer<typeof situationSchema>;

export const matchStateSchema = z.object({
  setting: z.object({
    time: z.string(),
    place: z.string(),
    enemyType: z.enum(["giant", "speed", "muscle", "technician"]),
    playerSignature: z.string().nullable(),
  }),
  player: fighterSchema,
  enemy: fighterSchema,
  turn: z.number(),
  status: z.enum(["in_progress", "finished"]),
  pendingEnemy: actionSchema.nullable(),
  enemyHistory: z.array(actionSchema),
  winner: side.nullable(),
  finish: z.string().nullable(),
  situation: situationSchema,
  log: z.array(turnLogSchema),
});
export type MatchState = z.infer<typeof matchStateSchema>;
