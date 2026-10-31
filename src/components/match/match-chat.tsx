"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatchStatus } from "@/db/app";
import type { ClientState } from "@/game/client-state";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { HpBar } from "./hp-bar";
import { DebugPanel } from "./debug-panel";

type ChatMessage = { role: "narrator" | "player"; text: string; debug?: unknown };
type Props = {
  matchId: string;
  initialStatus: MatchStatus;
  initialState: ClientState | null;
  initialMessages: ChatMessage[];
  debug: boolean;
};
type Event =
  | { type: "message"; role: "player"; text: string }
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "state"; state: ClientState; status: MatchStatus }
  | { type: "debug"; data: unknown }
  | { type: "error"; message: string };

const END = "<<END>>";

function Narration({ text }: { text: string }) {
  const ended = text.trimEnd().endsWith(END);
  const body = ended ? text.trimEnd().slice(0, -END.length) : text;
  return (
    <>
      <MessageResponse>{body}</MessageResponse>
      {ended && <p className="text-center font-mono text-sm text-muted-foreground">{END}</p>}
    </>
  );
}

export function MatchChat({ matchId, initialStatus, initialState, initialMessages, debug }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [state, setState] = useState(initialState);
  const [lastDebug, setLastDebug] = useState<unknown>(() => initialMessages.findLast((m) => m.role === "narrator")?.debug ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // ワークフローの再試行で同じ描写の start が再送されることがあるので、未確定の吹き出しは置き換える
  const liveRef = useRef(false);
  const startedRef = useRef(false);

  const handle = useCallback((e: Event) => {
    switch (e.type) {
      case "message":
        setMessages((ms) => [...ms, { role: e.role, text: e.text }]);
        break;
      case "start": {
        const replace = liveRef.current;
        liveRef.current = true;
        setMessages((ms) => [...(replace ? ms.slice(0, -1) : ms), { role: "narrator", text: "" }]);
        break;
      }
      case "delta":
        setMessages((ms) => {
          const last = ms.at(-1);
          if (last?.role !== "narrator") return ms;
          return [...ms.slice(0, -1), { ...last, text: last.text + e.text }];
        });
        break;
      case "state":
        liveRef.current = false;
        setState(e.state);
        setStatus(e.status);
        break;
      case "debug":
        setLastDebug(e.data);
        break;
      case "error":
        setNotice(e.message);
        break;
    }
  }, []);

  const advance = useCallback(
    async (text?: string) => {
      setBusy(true);
      setNotice("");
      try {
        const res = await fetch(`/api/matches/${matchId}/advance`, {
          method: "POST",
          ...(text !== undefined && {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          }),
        });
        if (res.status === 401) {
          router.push("/login");
          return false;
        }
        if (res.status === 409) {
          setNotice("処理中です");
          return false;
        }
        if (res.status === 400) {
          setNotice("行動を 500 文字以内で入力してください。");
          return false;
        }
        if (!res.ok || !res.body) {
          setNotice("通信に失敗しました。");
          return false;
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) handle(JSON.parse(line) as Event);
        }
        return true;
      } catch {
        setNotice("通信が切れました。ページを再読み込みしてください。");
        return false;
      } finally {
        liveRef.current = false;
        setBusy(false);
      }
    },
    [matchId, router, handle],
  );

  useEffect(() => {
    if (initialStatus !== "new" || startedRef.current) return;
    startedRef.current = true;
    void advance();
  }, [initialStatus, advance]);

  useEffect(() => {
    if (status !== "running" || busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [status, busy, router]);

  const winner = state?.winner ? state[state.winner].name : null;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 一覧
          </Link>
          {state && <span className="text-xs text-muted-foreground">ターン {state.turn}</span>}
        </div>
        {state ? <HpBar player={state.player} enemy={state.enemy} /> : <p className="text-sm text-muted-foreground">試合の準備中...</p>}
        {debug && <DebugPanel state={state} lastDebug={lastDebug} />}
      </header>

      <Conversation>
        <ConversationContent className="gap-6 px-4 py-6">
          {messages.map((m, i) => (
            <Message key={i} from={m.role === "player" ? "user" : "assistant"}>
              <MessageContent className="text-base leading-8">
                {m.role === "narrator" ? <Narration text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
              </MessageContent>
            </Message>
          ))}
          {busy && messages.at(-1)?.role !== "narrator" && <p className="text-sm text-muted-foreground">描写を待っています...</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <footer className="flex flex-col gap-2 border-t p-4">
        {notice && <p className="text-sm text-destructive">{notice}</p>}
        {status === "finished" ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-lg font-bold">勝者: {winner ?? "なし"}</p>
            {state?.finish && <p className="text-muted-foreground">決着: {state.finish}</p>}
            <Button asChild>
              <Link href="/">一覧へ戻る</Link>
            </Button>
          </div>
        ) : status === "failed" ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-destructive">試合の進行に失敗しました。</p>
            <Button asChild variant="outline">
              <Link href="/">一覧へ戻る</Link>
            </Button>
          </div>
        ) : (
          <PromptInput
            onSubmit={async ({ text }) => {
              // 失敗時に throw すると PromptInput が入力を消さずに残す
              if (!(await advance(text))) throw new Error("advance failed");
            }}
          >
            <PromptInputTextarea
              placeholder={status === "awaiting_input" ? "技や動きを自由に書いてください" : "描写を待っています..."}
              disabled={status !== "awaiting_input" || busy}
              maxLength={500}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit disabled={status !== "awaiting_input" || busy} status={busy ? "submitted" : undefined} />
            </PromptInputFooter>
          </PromptInput>
        )}
      </footer>
    </div>
  );
}
