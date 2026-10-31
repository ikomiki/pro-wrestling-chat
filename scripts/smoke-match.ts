import { appDb } from "../src/db/app";
import type { MatchState } from "../src/game/schema";
import { mastra } from "../src/mastra";

const ACTIONS = ["ドロップキック", "バックドロップ", "様子を見る", "サソリ固め"];
const MAX_TURNS = 30;

const id = await appDb.createMatch({ userId: "smoke", title: "smoke", setup: {} });
const workflow = mastra.getWorkflow("match");

type RunOutput = ReturnType<Awaited<ReturnType<typeof workflow.createRun>>["stream"]>;

async function drain(stream: RunOutput) {
  let narrations = 0;
  for await (const event of stream.fullStream) {
    const chunk = event as { type: string; data?: unknown };
    if (chunk.type === "data-narration" && (chunk.data as { kind: string }).kind === "start") narrations++;
    if (chunk.type === "data-state") process.stdout.write(`[data-state turn=${(chunk.data as MatchState).turn}] `);
  }
  console.log(`narrations=${narrations}`);
  return (await stream.result) as { status: string; result?: MatchState; error?: unknown };
}

let run = await workflow.createRun({ runId: id, resourceId: "smoke" });
let res = await drain(run.stream({ inputData: { time: "", place: "", player: "", playerSignature: "", enemy: "" } }));
for (let i = 0; res.status === "suspended" && i < MAX_TURNS; i++) {
  const text = ACTIONS[i % ACTIONS.length];
  console.log(`turn ${i + 1}: resume "${text}"`);
  await appDb.appendMessage({ matchId: id, role: "player", text });
  run = await workflow.createRun({ runId: id, resourceId: "smoke" });
  res = await drain(await run.resumeStream({ resumeData: { text } }));
}

const failures: string[] = [];
const state = res.result;
if (res.status !== "success") failures.push(`workflow status ${res.status} ${JSON.stringify(res.error ?? "")}`);
if (state?.status !== "finished") failures.push(`state.status ${state?.status}`);
if (state && state.player.hp !== 0 && state.enemy.hp !== 0) failures.push("no fighter at hp 0");
const messages = await appDb.listMessages(id);
const lastNarration = messages.filter((m) => m.role === "narrator").at(-1);
if (!lastNarration?.text.endsWith("<<END>>")) failures.push("last narration does not end with <<END>>");

const cats = state?.enemyHistory.map((a) => a.category) ?? [];
if (cats.some((c, i) => i >= 2 && c === cats[i - 1] && c === cats[i - 2])) {
  console.warn(`WARN: enemy used the same category 3 turns in a row: ${cats.join(",")}`);
}

for (const m of messages) console.log(`\n--- ${m.role}\n${m.text}`);
console.log(`\nmatch ${id}: turns=${state?.turn} winner=${state?.winner} finish=${state?.finish} hp=${state?.player.hp}/${state?.enemy.hp} enemy=${cats.join(",")}`);
if (failures.length) {
  console.error(`FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("OK: all checks passed");
