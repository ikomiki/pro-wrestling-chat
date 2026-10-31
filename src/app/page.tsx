import { Suspense } from "react";
import Link from "next/link";
import { appDb, type MatchStatus } from "@/db/app";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "./SignOutButton";

const STATUS_BADGE: Record<MatchStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  new: { label: "進行中", variant: "default" },
  running: { label: "進行中", variant: "default" },
  awaiting_input: { label: "進行中", variant: "default" },
  finished: { label: "終了", variant: "secondary" },
  failed: { label: "エラー", variant: "destructive" },
};

async function Matches() {
  const user = await requireUser();
  const matches = await appDb.listMatches(user.id);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">ログイン中: {user.name}</p>
        <SignOutButton />
      </div>
      {matches.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">まだ試合がありません。</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {matches.map((m) => {
            const badge = STATUS_BADGE[m.status];
            return (
              <li key={m.id}>
                <Link href={`/matches/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                  <span className="flex-1 truncate font-medium">{m.title}</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <time dateTime={m.updatedAt} className="w-36 text-right text-xs text-muted-foreground">
                    {new Date(m.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">試合一覧</h1>
        <Button asChild>
          <Link href="/matches/new">新しい試合</Link>
        </Button>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">読み込み中...</p>}>
        <Matches />
      </Suspense>
    </main>
  );
}
