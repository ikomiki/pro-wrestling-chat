import { Suspense } from "react";
import { notFound } from "next/navigation";
import { appDb } from "@/db/app";
import { isDebug, toClientState } from "@/game/client-state";
import type { MatchState } from "@/game/schema";
import { requireUser } from "@/lib/session";
import { MatchChat } from "@/components/match/match-chat";

async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const match = await appDb.getMatch(id, user.id);
  if (!match) notFound();
  const debug = isDebug();
  const messages = await appDb.listMessages(id);
  return (
    <MatchChat
      // 切断後の再読み込み (router.refresh) で新しい props を初期 state に反映させるため
      key={match.updatedAt}
      matchId={id}
      initialStatus={match.status}
      initialState={match.state ? toClientState(match.state as MatchState, debug) : null}
      initialMessages={messages.map((m) => ({ role: m.role, text: m.text, ...(debug && { debug: m.debug }) }))}
      debug={debug}
    />
  );
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">読み込み中...</p>}>
      <Match params={params} />
    </Suspense>
  );
}
