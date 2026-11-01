"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FIELDS = [
  { name: "time", label: "時刻", placeholder: "例: 真夏の夜 20 時", long: false },
  { name: "place", label: "場所", placeholder: "例: 地方の体育館、満員の観客", long: false },
  { name: "player", label: "プレイヤーの設定", placeholder: "例: デビュー 3 年目の若手。負けず嫌いのベビーフェイス", long: true },
  { name: "playerSignature", label: "得意技（任意）", placeholder: "例: ムーンサルト・プレス", long: false },
  { name: "enemy", label: "敵の設定", placeholder: "例: 身長 2 メートルのベテラン悪役", long: true },
] as const;

export default function NewMatchPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  // cacheComponents では遷移後もページが Activity で隠れて残るため、戻ったときに「準備中」が残らないよう隠れる時点で戻す
  useLayoutEffect(() => () => setPending(false), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(FIELDS.map(({ name }) => [name, String(f.get(name) ?? "")]));
    setPending(true);
    setError("");
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.status === 401) return router.push("/login");
    if (!res?.ok) {
      setPending(false);
      return setError("試合を作れませんでした。もう一度お試しください。");
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/matches/${id}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <Card>
        <CardHeader>
          <CardTitle>新しい試合</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            {FIELDS.map(({ name, label, placeholder, long }) => (
              <div key={name} className="flex flex-col gap-2">
                <Label htmlFor={name}>{label}</Label>
                {long ? (
                  <Textarea id={name} name={name} placeholder={placeholder} maxLength={500} rows={3} />
                ) : (
                  <Input id={name} name={name} placeholder={placeholder} maxLength={500} />
                )}
                <p className="text-xs text-muted-foreground">空欄なら AI がランダムに決めます</p>
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" asChild>
                <Link href="/">戻る</Link>
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "準備中..." : "試合開始"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
