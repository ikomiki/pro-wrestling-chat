import { appDb, isStaleRunning, type MatchStatus } from "@/db/app";
import { isDebug, toClientState } from "@/game/client-state";
import type { MatchState, SetupInput } from "@/game/schema";
import { auth } from "@/lib/auth";
import { mastra } from "@/mastra";
import { parseActionBody } from "./parse";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  const userId = session.user.id;
  const { id } = await ctx.params;
  const match = await appDb.getMatch(id, userId);
  if (!match) return new Response(null, { status: 404 });
  if (isStaleRunning(match)) {
    await appDb.updateMatch(id, { status: "failed" });
    return new Response(null, { status: 409 });
  }

  let text: string | null = null;
  if (match.status === "awaiting_input") {
    const parsed = parseActionBody(await req.json().catch(() => null));
    if (!parsed.ok) return new Response(null, { status: 400 });
    text = parsed.text;
  } else if (match.status !== "new") {
    return new Response(null, { status: 409 });
  }
  if (!(await appDb.claim(id, userId, match.status))) return new Response(null, { status: 409 });

  const debug = isDebug();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let open = true;
      // 切断後も run を最後まで進めるため、書き込み失敗は握りつぶして読み取りを続ける
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      const close = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          // クライアント切断などでストリームが既に閉じていると throw するが、閉じる目的は達しているので捨てる
        }
      };
      void (async () => {
        let status: string;
        try {
          const workflow = mastra.getWorkflow("match");
          const run = await workflow.createRun({ runId: id, resourceId: userId });
          let output;
          if (text === null) {
            output = await run.stream({ inputData: match.setup as SetupInput });
          } else {
            await appDb.appendMessage({ matchId: id, role: "player", text });
            send({ type: "message", role: "player", text });
            output = await run.resumeStream({ resumeData: { text } });
          }
          for await (const chunk of output.fullStream as AsyncIterable<{ type: string; data?: unknown }>) {
            if (chunk.type === "data-narration") {
              const n = chunk.data as { kind: "start" | "delta" | "end"; text?: string };
              if (n.kind === "start") send({ type: "start" });
              if (n.kind === "delta") send({ type: "delta", text: n.text ?? "" });
            } else if (chunk.type === "data-progress") {
              send({ type: "progress", label: (chunk.data as { label: string }).label });
            } else if (chunk.type === "data-state") {
              const state = chunk.data as MatchState;
              const s: MatchStatus = state.status === "finished" ? "finished" : "running";
              send({ type: "state", state: toClientState(state, debug), status: s });
              // data-state はワークフローが narrator メッセージを保存した直後に流れる
              if (debug) {
                const last = (await appDb.listMessages(id)).filter((m) => m.role === "narrator").at(-1);
                send({ type: "debug", data: last?.debug ?? null });
              }
            }
          }
          status = ((await output.result) as { status: string }).status;
        } catch (e) {
          console.error("advance failed", id, e);
          status = "failed";
        }
        // success / suspended 以外で終わると status が running のまま残り、二度と進められなくなる
        if (status !== "success" && status !== "suspended") {
          await appDb.updateMatch(id, { status: "failed" }).catch(() => {});
          send({ type: "error", message: "試合の進行に失敗しました。" });
        }
        const final = await appDb.getMatch(id, userId).catch(() => null);
        if (final?.state) {
          send({ type: "state", state: toClientState(final.state as MatchState, debug), status: final.status });
        }
        close();
      })();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
