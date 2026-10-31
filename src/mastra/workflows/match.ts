import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { ToolStream } from "@mastra/core/tools";
import { z } from "zod";
import { appDb } from "../../db/app";
import { adjustCategoryTable, sanitizeWeights } from "../../game/enemy-table";
import { cryptoRng } from "../../game/random";
import { resolveTurn } from "../../game/rules";
import { actionSchema, matchStateSchema, setupInputSchema, turnLogSchema, type MatchState, type SetupInput } from "../../game/schema";
import { SEEDS } from "../../game/seeds";
import { ENEMY_TYPE_LABEL, type Category, type EnemyType, type Grade } from "../../game/types";
import { analyst, narrator } from "../agents";
import {
  classifyPrompt, completeSetupPrompt, enemyMovePrompt, enemyTablePrompt, finishPrompt, resultPrompt, scenePrompt,
} from "../prompts";
import { pickWithTool } from "../tools/random-pick";

const ENEMY_TYPES = Object.keys(ENEMY_TYPE_LABEL) as EnemyType[];
const even = (labels: readonly string[]) => labels.map((label) => ({ label, weight: 1 }));
const asOptions = (t: Record<string, number>) => Object.entries(t).map(([label, weight]) => ({ label, weight }));

async function narrate(writer: ToolStream, runId: string, prompt: string, state: MatchState, debug: unknown) {
  await writer.custom({ type: "data-narration", data: { kind: "start" } });
  const stream = await narrator.stream(prompt);
  let text = "";
  for await (const delta of stream.textStream) {
    text += delta;
    await writer.custom({ type: "data-narration", data: { kind: "delta", text: delta } });
  }
  if (state.status === "finished") {
    const end = "\n\n<<END>>";
    text += end;
    await writer.custom({ type: "data-narration", data: { kind: "delta", text: end } });
  }
  await writer.custom({ type: "data-narration", data: { kind: "end" } });
  await appDb.appendMessage({ matchId: runId, role: "narrator", text, debug });
  await appDb.updateMatch(runId, { state, ...(state.status === "finished" && { status: "finished" as const }) });
  await writer.custom({ type: "data-state", data: state });
}

const setupStep = createStep({
  id: "setup",
  inputSchema: setupInputSchema,
  outputSchema: matchStateSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const seeds: Partial<Record<keyof SetupInput, string>> = {};
    for (const key of ["time", "place", "player", "enemy"] as const) {
      if (!inputData[key].trim()) seeds[key] = (await pickWithTool(even(SEEDS[key]))).label;
    }
    if (seeds.enemy) {
      const type = (await pickWithTool(even(ENEMY_TYPES))).label as EnemyType;
      seeds.enemy += `（タイプ: ${ENEMY_TYPE_LABEL[type]}）`;
    }
    const res = await analyst.generate(completeSetupPrompt(inputData, seeds), {
      structuredOutput: {
        schema: z.object({
          time: z.string(), place: z.string(),
          playerName: z.string(), playerDescription: z.string(),
          enemyName: z.string(), enemyDescription: z.string(),
          enemyType: z.enum(["giant", "speed", "muscle", "technician", "unknown"]),
        }),
      },
    });
    const s = res.object;
    const enemyType = s.enemyType === "unknown" ? ((await pickWithTool(even(ENEMY_TYPES))).label as EnemyType) : s.enemyType;
    return {
      setting: { time: s.time, place: s.place, enemyType, playerSignature: inputData.playerSignature.trim() || null },
      player: { name: s.playerName, description: s.playerDescription, hp: 5, maxHp: 5 },
      enemy: { name: s.enemyName, description: s.enemyDescription, hp: 5, maxHp: 5 },
      turn: 0,
      status: "in_progress" as const,
      pendingEnemy: null,
      enemyHistory: [],
      winner: null,
      finish: null,
      log: [],
    };
  },
});

const withTable = matchStateSchema.extend({ enemyTable: turnLogSchema.shape.enemyTable });
const withInput = withTable.extend({ playerInput: z.string() });

const sceneStep = createStep({
  id: "scene",
  inputSchema: matchStateSchema,
  outputSchema: withTable,
  retries: 2,
  execute: async ({ inputData, runId, writer }) => {
    const state: MatchState = { ...inputData, turn: inputData.turn + 1 };
    const w = z.number();
    const table = await analyst.generate(enemyTablePrompt(state), {
      structuredOutput: {
        schema: z.object({
          category: z.object({ throw: w, submission: w, strike: w, aerial: w }),
          grade: z.object({ normal: w, big: w, finisher: w }),
        }),
      },
    });
    const lastCategory = state.enemyHistory.at(-1)?.category;
    const enemyTable = adjustCategoryTable(table.object.category, lastCategory && lastCategory !== "none" ? lastCategory : null);
    const gradeTable = sanitizeWeights(table.object.grade);
    const categoryPick = await pickWithTool(asOptions(enemyTable));
    const gradePick = await pickWithTool(asOptions(gradeTable));
    const category = categoryPick.label as Category;
    const grade = gradePick.label as Grade;
    const move = await analyst.generate(enemyMovePrompt(state, category, grade), {
      structuredOutput: { schema: z.object({ name: z.string() }) },
    });
    const pendingEnemy = { name: move.object.name, category, grade };
    const next: MatchState = { ...state, pendingEnemy };
    await narrate(writer, runId, scenePrompt(next, pendingEnemy), next, {
      enemyTable, gradeTable, categoryPick, gradePick, enemyAction: pendingEnemy,
    });
    return { ...next, enemyTable };
  },
});

const playerActionStep = createStep({
  id: "playerAction",
  inputSchema: withTable,
  outputSchema: withInput,
  resumeSchema: z.object({ text: z.string() }),
  suspendSchema: z.object({ turn: z.number() }),
  retries: 2,
  execute: async ({ inputData, resumeData, suspend, runId }) => {
    if (!resumeData) {
      const { enemyTable: _, ...state } = inputData;
      await appDb.updateMatch(runId, { status: "awaiting_input", state });
      return await suspend({ turn: inputData.turn });
    }
    return { ...inputData, playerInput: resumeData.text };
  },
});

const resolveStep = createStep({
  id: "resolve",
  inputSchema: withInput,
  outputSchema: matchStateSchema,
  retries: 2,
  execute: async ({ inputData, runId, writer }) => {
    const { enemyTable, playerInput, ...state } = inputData;
    const enemyAction = state.pendingEnemy;
    if (!enemyAction) throw new Error("resolve: pendingEnemy is missing");
    const classified = await analyst.generate(classifyPrompt(state, playerInput), {
      structuredOutput: { schema: actionSchema },
    });
    const playerAction = classified.object;
    const result = resolveTurn({ player: state.player, enemy: state.enemy, playerAction, enemyAction }, cryptoRng);
    const log = { turn: state.turn, enemyTable, enemyAction, playerInput, playerAction, result };
    let next: MatchState = {
      ...state,
      player: result.player,
      enemy: result.enemy,
      log: [...state.log, log],
      enemyHistory: [...state.enemyHistory, enemyAction],
      pendingEnemy: null,
    };
    if (result.winner) {
      const lastHit = result.winner === "player" ? playerAction : enemyAction;
      const fin = await analyst.generate(finishPrompt(next, lastHit), {
        structuredOutput: { schema: z.object({ finish: z.string() }) },
      });
      next = { ...next, status: "finished", winner: result.winner, finish: fin.object.finish };
    }
    await narrate(writer, runId, resultPrompt(next, log), next, {
      enemyTable, enemyAction, playerAction, affinityWinner: result.affinityWinner, attempts: result.attempts,
    });
    return next;
  },
});

const turn = createWorkflow({ id: "turn", inputSchema: matchStateSchema, outputSchema: matchStateSchema })
  .then(sceneStep)
  .then(playerActionStep)
  .then(resolveStep)
  .commit();

export const match = createWorkflow({ id: "match", inputSchema: setupInputSchema, outputSchema: matchStateSchema })
  .then(setupStep)
  .dountil(turn, async ({ inputData }) => inputData.status === "finished")
  .commit();
