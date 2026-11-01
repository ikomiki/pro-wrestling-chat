# プロレスチャット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログインしたユーザーが、Gemini が小説調に描写する 1 対 1 のターン制プロレス試合をチャットで遊べる Web アプリを作る。

**Architecture:** 判定・乱数・体力計算は `src/game/` の純粋関数で決め、AI は分類・発生率テーブル・描写だけを担当する。試合 1 つは Mastra Workflow の 1 run（runId = 試合 ID）。ターンはネストしたワークフローを `dountil` で回し、プレイヤー入力で suspend / resume する。描写はステップ内で `writer.custom` に流し、Route Handler が NDJSON に変換してクライアントへストリーミングする。

**Tech Stack:** Next.js 16.4.3 (App Router, bun), `@mastra/core` 1.x, `@mastra/libsql`, `@libsql/client`, `better-auth` 1.7 + `@libsql/kysely-libsql`, shadcn/ui (Radix), AI Elements, Zod 4, Gemini `google/gemini-3.8-flash`

**Spec:** `docs/superpowers/specs/2026-10-31-pro-wrestling-chat-design.md`

## Global Constraints

- Next.js 16 は学習データと API が違う。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを読む（AGENTS.md）
- Mastra の API は記憶で書かない。`node_modules/@mastra/*/dist/docs/` を先に確認する（`.claude/skills/mastra`）
- `next.config.ts` は `cacheComponents: true`。`headers()` / `getSession` を読むコンポーネントは `<Suspense>` の内側の async 子コンポーネントに置く
- AI Elements は Radix 版のみ。`shadcn init` では Radix を選ぶ（base-ui を選ばない）
- AI SDK 系ヘルパーを使う場合は v7（`ai@7`, `@ai-sdk/react@4`）
- モデル ID は `google/gemini-3.8-flash`。キーは `GOOGLE_GENERATIVE_AI_API_KEY`
- 初期体力・最大体力は 5。ダメージは通常 1 / 大技 2 / 必殺技 3
- UI 文言・プロンプト・描写はすべて日本語
- 試合終了ターンの描写末尾は `<<END>>`、状態の `status` は `finished`
- DB は `data/auth.db`, `data/mastra.db`, `data/app.db` の 3 ファイル（同じファイルを複数クライアントで開かない）。`data/` は gitignore
- 環境変数: `GOOGLE_GENERATIVE_AI_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DEBUG_MODE`（`"true"` のときだけデバッグ表示）
- テストは `bun test`。コード内コメントは非自明な WHY だけ

## Review Focus

- 同じ試合への二重送信（連打・2 タブ）: 2 回目は 409 になり、プレイヤー発言が二重に保存されない → Task 4 `claimForInput` のテスト
- 他人の試合 ID を URL に入れる: 404 になり、状態も描写も返さない → Task 4 `getMatch` の所有者テスト
- 空文字・空白のみ・極端に長い行動入力: 400 で弾き、ワークフローを resume しない → Task 8 `parseActionBody` のテスト
- AI が壊れた発生率テーブル（全部 0、負数、NaN）を返す: 均等または下限付きで必ず抽選できる → Task 3 のテスト
- デバッグモード OFF で敵の選んだ技がクライアントに漏れる: `toClientState` が `pendingEnemy` と `log` を落とす → Task 8 のテスト

---

## File Structure

```
src/game/types.ts          技の種類・格・Action・Fighter・EnemyType の型と日本語ラベル
src/game/random.ts         暗号乱数 Rng、weightedPick、chance
src/game/rules.ts          相性・成功率・ダメージ・resolveTurn
src/game/enemy-table.ts    AI の発生率テーブルの検証と補正
src/game/seeds.ts          空欄補完用の「種」候補表
src/game/schema.ts         MatchState / SetupInput の Zod スキーマ
src/game/fixtures.ts       テスト用の sampleState
src/game/client-state.ts   クライアントに送る状態の整形（デバッグ OFF で秘匿）
src/db/app.ts              試合・メッセージの libSQL アクセス
src/lib/auth.ts            Better Auth サーバー設定
src/lib/auth-client.ts     Better Auth クライアント
src/lib/session.ts         requireUser()（未ログインなら /login へ）
src/proxy.ts               セッション Cookie が無ければ /login へ
src/mastra/tools/random-pick.ts  乱数発生スキル（createTool）
src/mastra/agents.ts       analyst（構造化出力）と narrator（描写）
src/mastra/prompts.ts      プロンプト組み立て関数
src/mastra/workflows/match.ts    setup → dountil(turn) のワークフロー
src/mastra/index.ts        Mastra インスタンス
src/app/api/auth/[...all]/route.ts
src/app/api/matches/route.ts               POST: 試合作成
src/app/api/matches/[id]/advance/route.ts  POST: 開始 / 行動送信（NDJSON ストリーム）
src/app/login/page.tsx
src/app/page.tsx                            試合一覧
src/app/matches/new/page.tsx                状況設定フォーム
src/app/matches/[id]/page.tsx
src/components/match/match-chat.tsx         チャット本体（client）
src/components/match/hp-bar.tsx
src/components/match/debug-panel.tsx
scripts/smoke-match.ts                      実 API で 1 試合を自動で回す確認スクリプト
```

---

### Task 1: 乱数

**Files:**
- Create: `src/game/random.ts`, `src/game/random.test.ts`
- Modify: `package.json`（devDependencies に `@types/bun`、scripts に `"test": "bun test"`）

**Interfaces:**
- Produces:
  - `type Rng = (max: number) => number` — `[0, max)` の整数
  - `cryptoRng: Rng` — `node:crypto` の `randomInt`
  - `weightedPick<T>(table: { value: T; weight: number }[], rng: Rng): { value: T; roll: number }` — `roll` は `[0, 合計重み×100)` の整数。重みは非負の小数可
  - `chance(percent: number, rng: Rng): { ok: boolean; roll: number }` — `roll = rng(100)`、`ok = roll < percent`
  - テスト用 `queueRng(values: number[]): Rng` — 値を順に返す（`src/game/random.ts` から export）

- [ ] **Step 1: 失敗するテストを書く**

```ts
test("weightedPick は累積重みで選ぶ", () => {
  const table = [{ value: "a", weight: 1 }, { value: "b", weight: 3 }];
  expect(weightedPick(table, queueRng([0])).value).toBe("a");
  expect(weightedPick(table, queueRng([99])).value).toBe("a");
  expect(weightedPick(table, queueRng([100])).value).toBe("b");
  expect(weightedPick(table, queueRng([399])).value).toBe("b");
});
test("重み 0 の候補は選ばれない", () => {
  const table = [{ value: "a", weight: 0 }, { value: "b", weight: 1 }];
  expect(weightedPick(table, queueRng([0])).value).toBe("b");
});
test("chance は roll < percent で成功", () => {
  expect(chance(90, queueRng([89])).ok).toBe(true);
  expect(chance(90, queueRng([90])).ok).toBe(false);
  expect(chance(100, queueRng([99])).ok).toBe(true);
});
test("cryptoRng は範囲内", () => {
  for (let i = 0; i < 100; i++) { const n = cryptoRng(4); expect(n >= 0 && n < 4).toBe(true); }
});
```

- [ ] **Step 2: `bun test src/game/random.test.ts` → FAIL（モジュールなし）**
- [ ] **Step 3: `src/game/random.ts` を実装**（重みは `Math.round(w * 100)` の整数にして抽選）
- [ ] **Step 4: `bun test src/game/random.test.ts` → PASS**
- [ ] **Step 5: Commit** `feat(game): 暗号乱数による重み付き抽選を追加`

---

### Task 2: 判定ルール

**Files:**
- Create: `src/game/types.ts`, `src/game/rules.ts`, `src/game/rules.test.ts`

**Interfaces:**
- Consumes: `Rng`, `chance`, `queueRng`（Task 1）
- Produces（`types.ts`）:
  - `type Category = "throw" | "submission" | "strike" | "aerial"`、`CATEGORY_LABEL: Record<Category, string>`（投げ技 / 極め技 / 打撃技 / 飛び技）
  - `type Grade = "normal" | "big" | "finisher"`、`GRADE_LABEL`（通常 / 大技 / 必殺技）
  - `type EnemyType = "giant" | "speed" | "muscle" | "technician"`、`ENEMY_TYPE_LABEL`（巨漢 / スピード / マッチョ / 技巧派）、`ENEMY_TYPE_TENDENCY: Record<EnemyType, Category>`（giant→throw, speed→aerial, muscle→strike, technician→submission）
  - `type Action = { name: string; category: Category | "none"; grade: Grade }`（`"none"` = 技なし）
  - `type Fighter = { name: string; description: string; hp: number; maxHp: number }`
  - `type Side = "player" | "enemy"`
- Produces（`rules.ts`）:
  - `DAMAGE: Record<Grade, number> = { normal: 1, big: 2, finisher: 3 }`
  - `beats(a: Category, b: Category): boolean` — throw>strike, strike>submission, submission>throw。aerial は常に false
  - `successRate(grade: Grade, defender: Fighter): number`
  - `resolveTurn(input: { player: Fighter; enemy: Fighter; playerAction: Action; enemyAction: Action }, rng: Rng): TurnResult`
  - `type TurnResult = { affinityWinner: Side | null; attempts: { side: Side; rate: number; roll: number; hit: boolean }[]; player: Fighter; enemy: Fighter; winner: Side | null }`

成功率表（受ける側の `hp / maxHp`）:

| 比率 | normal | big | finisher |
|---|---|---|---|
| > 0.6 | 90 | 50 | 20 |
| > 0.3 | 95 | 70 | 45 |
| ≤ 0.3 | 100 | 90 | 70 |

`resolveTurn` の手順（この順で乱数を消費する。テストが順序に依存する）:
1. プレイヤーが `"none"` → 敵だけ判定
2. 双方が飛び技以外かつ種類が違う → `beats` の勝者だけ判定。負けた側は判定しない
3. それ以外（同じ種類・どちらかが飛び技）→ プレイヤー、敵の順にそれぞれ判定
4. 成功率は**ターン開始時点**の受ける側の体力で決める。命中した技のダメージを引き、体力は 0 で止める
5. 両者 0 → `rng(2)` が 0 ならプレイヤー勝ち。片方だけ 0 → もう片方の勝ち

- [ ] **Step 1: 失敗するテストを書く**

```ts
const f = (hp: number): Fighter => ({ name: "x", description: "", hp, maxHp: 5 });
const act = (category: Action["category"], grade: Grade = "normal"): Action => ({ name: "技", category, grade });

test("相性", () => {
  expect(beats("throw", "strike")).toBe(true);
  expect(beats("strike", "submission")).toBe(true);
  expect(beats("submission", "throw")).toBe(true);
  expect(beats("strike", "throw")).toBe(false);
  expect(beats("aerial", "throw")).toBe(false);
  expect(beats("throw", "aerial")).toBe(false);
});
test("成功率は受ける側の残り体力で決まる", () => {
  expect([5, 4].map(hp => successRate("finisher", f(hp)))).toEqual([20, 20]);
  expect([3, 2].map(hp => successRate("big", f(hp)))).toEqual([70, 70]);
  expect(successRate("normal", f(1))).toBe(100);
});
test("相性勝ちの側だけ判定し、命中で相手にダメージ", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("throw", "big"), enemyAction: act("strike") }, queueRng([0]));
  expect(r.affinityWinner).toBe("player");
  expect(r.attempts).toHaveLength(1);
  expect(r.enemy.hp).toBe(3);
  expect(r.player.hp).toBe(5);
});
test("相性勝ちでも外れればダメージなし", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("throw", "finisher"), enemyAction: act("strike") }, queueRng([20]));
  expect(r.enemy.hp).toBe(5);
  expect(r.player.hp).toBe(5);
});
test("同じ種類は双方判定、両方命中で相打ち", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("strike"), enemyAction: act("strike", "big") }, queueRng([0, 0]));
  expect(r.attempts.map(a => a.side)).toEqual(["player", "enemy"]);
  expect([r.player.hp, r.enemy.hp]).toEqual([3, 4]);
});
test("飛び技が絡むと双方判定", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("aerial"), enemyAction: act("throw") }, queueRng([99, 0]));
  expect(r.affinityWinner).toBeNull();
  expect([r.player.hp, r.enemy.hp]).toEqual([4, 5]);
});
test("技なしは敵だけ判定", () => {
  const r = resolveTurn({ player: f(5), enemy: f(5), playerAction: act("none"), enemyAction: act("throw") }, queueRng([0]));
  expect(r.attempts).toEqual([expect.objectContaining({ side: "enemy", hit: true })]);
  expect(r.player.hp).toBe(4);
});
test("体力は 0 で止まり、勝者が決まる", () => {
  const r = resolveTurn({ player: f(5), enemy: f(1), playerAction: act("throw", "finisher"), enemyAction: act("strike") }, queueRng([0]));
  expect(r.enemy.hp).toBe(0);
  expect(r.winner).toBe("player");
});
test("同時に 0 なら rng(2) で勝者", () => {
  const input = { player: f(1), enemy: f(1), playerAction: act("strike"), enemyAction: act("strike") };
  expect(resolveTurn(input, queueRng([0, 0, 0])).winner).toBe("player");
  expect(resolveTurn(input, queueRng([0, 0, 1])).winner).toBe("enemy");
});
```

- [ ] **Step 2: `bun test src/game/rules.test.ts` → FAIL**
- [ ] **Step 3: `types.ts` と `rules.ts` を実装**
- [ ] **Step 4: `bun test src/game/rules.test.ts` → PASS**
- [ ] **Step 5: Commit** `feat(game): 相性・成功率・ダメージの判定ルールを追加`

---

### Task 3: 敵の発生率テーブルの補正

**Files:**
- Create: `src/game/enemy-table.ts`, `src/game/enemy-table.test.ts`

**Interfaces:**
- Consumes: `Category`, `Grade`（Task 2）
- Produces:
  - `CATEGORY_FLOOR = 10`, `REPEAT_FACTOR = 0.5`（どちらも実装者判断の値）
  - `sanitizeWeights<K extends string>(raw: Record<K, number>): Record<K, number>` — 負数・NaN・非有限は 0。合計 0 なら全部 1
  - `adjustCategoryTable(raw: Record<Category, number>, last: Category | null): Record<Category, number>` — sanitize → 合計 100 に正規化 → `last` を `REPEAT_FACTOR` 倍 → 各値を `max(v, CATEGORY_FLOOR)`。再正規化はしない（`weightedPick` は合計 100 を要求しない）

- [ ] **Step 1: 失敗するテストを書く**

```ts
const all = (n: number) => ({ throw: n, submission: n, strike: n, aerial: n });

test("全部 0 なら均等", () => {
  expect(adjustCategoryTable(all(0), null)).toEqual(all(25));
});
test("負数・NaN は 0 扱い", () => {
  expect(sanitizeWeights({ a: -3, b: Number.NaN, c: 2 })).toEqual({ a: 0, b: 0, c: 2 });
});
test("どの種類も下限を下回らない", () => {
  const t = adjustCategoryTable({ throw: 100, submission: 0, strike: 0, aerial: 0 }, null);
  for (const v of Object.values(t)) expect(v).toBeGreaterThanOrEqual(CATEGORY_FLOOR);
});
test("直前と同じ種類は半分になる", () => {
  const t = adjustCategoryTable({ throw: 60, submission: 20, strike: 10, aerial: 10 }, "throw");
  expect(t.throw).toBe(30);
  expect(t.submission).toBe(20);
});
```

- [ ] **Step 2: `bun test src/game/enemy-table.test.ts` → FAIL**
- [ ] **Step 3: 実装**
- [ ] **Step 4: `bun test src/game/enemy-table.test.ts` → PASS**
- [ ] **Step 5: Commit** `feat(game): 敵の発生率テーブルの下限と連続抑止を追加`

---

### Task 4: 試合データの保存

**Files:**
- Create: `src/db/app.ts`, `src/db/app.test.ts`
- Modify: `.gitignore`（`data/` を追加）
- 依存: `bun add @libsql/client`

**Interfaces:**
- Produces:
  - `type MatchStatus = "new" | "running" | "awaiting_input" | "finished" | "failed"`
  - `type MatchRow = { id: string; userId: string; title: string; status: MatchStatus; state: unknown | null; setup: unknown; createdAt: string; updatedAt: string }`
  - `type MessageRow = { id: number; matchId: string; role: "narrator" | "player"; text: string; debug: unknown | null; createdAt: string }`
  - `createAppDb(url: string): AppDb` — `CREATE TABLE IF NOT EXISTS` で `matches`, `messages` を作る（`ready: Promise<void>` を持たせ、各メソッドの先頭で await）
  - `appDb: AppDb` — `createAppDb("file:data/app.db")` のシングルトン（`data/` が無ければ作る）
  - `AppDb` のメソッド:
    - `createMatch(input: { userId: string; title: string; setup: unknown }): Promise<string>`（id は `crypto.randomUUID()`、status `new`）
    - `getMatch(id: string, userId: string): Promise<MatchRow | null>` — 所有者以外は null
    - `listMatches(userId: string): Promise<MatchRow[]>` — 新しい順
    - `updateMatch(id: string, patch: { status?: MatchStatus; state?: unknown }): Promise<void>`
    - `claim(id: string, userId: string, from: MatchStatus): Promise<boolean>` — `UPDATE ... SET status='running' WHERE id=? AND user_id=? AND status=?`、`rowsAffected === 1` で true
    - `appendMessage(input: { matchId: string; role: "narrator" | "player"; text: string; debug?: unknown }): Promise<void>`
    - `listMessages(matchId: string): Promise<MessageRow[]>` — id 昇順
  - JSON 列は `JSON.stringify` / `JSON.parse` で出し入れする

- [ ] **Step 1: 失敗するテストを書く**（`createAppDb(":memory:")` を使う）

```ts
test("他人の試合は取得できない", async () => {
  const db = createAppDb(":memory:");
  const id = await db.createMatch({ userId: "u1", title: "t", setup: {} });
  expect(await db.getMatch(id, "u2")).toBeNull();
  expect((await db.getMatch(id, "u1"))?.status).toBe("new");
});
test("claim は一度しか成功しない", async () => {
  const db = createAppDb(":memory:");
  const id = await db.createMatch({ userId: "u1", title: "t", setup: {} });
  await db.updateMatch(id, { status: "awaiting_input" });
  const results = await Promise.all([db.claim(id, "u1", "awaiting_input"), db.claim(id, "u1", "awaiting_input")]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await db.claim(id, "u2", "running")).toBe(false);
});
test("メッセージは追加順に返る", async () => {
  const db = createAppDb(":memory:");
  const id = await db.createMatch({ userId: "u1", title: "t", setup: {} });
  await db.appendMessage({ matchId: id, role: "narrator", text: "a", debug: { x: 1 } });
  await db.appendMessage({ matchId: id, role: "player", text: "b" });
  const rows = await db.listMessages(id);
  expect(rows.map(r => r.text)).toEqual(["a", "b"]);
  expect(rows[0].debug).toEqual({ x: 1 });
});
```

- [ ] **Step 2: `bun test src/db/app.test.ts` → FAIL**
- [ ] **Step 3: 実装**
- [ ] **Step 4: `bun test src/db/app.test.ts` → PASS**
- [ ] **Step 5: Commit** `feat(db): 試合とメッセージの保存を追加`

---

### Task 5: ログイン（Better Auth）と UI 基盤

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/proxy.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/login/page.tsx`, `.env.example`
- Modify: `src/app/layout.tsx`（`lang="ja"`、タイトル）、`src/app/page.tsx`（雛形を消して仮の「ログイン中: {name}」表示。Task 9 で置き換える）
- 依存: `bun add better-auth @libsql/kysely-libsql`、`bunx --bun shadcn@latest init`（**Radix を選ぶ**）、`bunx --bun shadcn@latest add button input label card`

**Interfaces:**
- Produces:
  - `auth`（`betterAuth({ database: { dialect: new LibsqlDialect({ url: "file:data/auth.db" }), type: "sqlite" }, emailAndPassword: { enabled: true }, plugins: [nextCookies()] })`）
  - `authClient`（`createAuthClient()` from `better-auth/react`）
  - `requireUser(): Promise<{ id: string; name: string; email: string }>` — `auth.api.getSession({ headers: await headers() })`、無ければ `redirect("/login")`
  - `proxy.ts`: `/login` と `/api/auth/*` 以外で `getSessionCookie(request)` が無ければ `/login` へリダイレクト
- `/login`: メール・パスワード・名前（サインアップ時のみ）のフォーム。ログイン / 新規登録の切り替え。成功で `/` へ

- [ ] **Step 1: 依存を入れ、`.env.example` に 4 つの環境変数を書き、`.env.local` を作る**（`BETTER_AUTH_SECRET` は `openssl rand -base64 32`、`BETTER_AUTH_URL=http://localhost:3000`）
- [ ] **Step 2: `src/lib/auth.ts` を書き、`bunx auth@latest migrate` を実行** → `data/auth.db` に `user`, `session`, `account`, `verification` テーブルができる。`LibsqlDialect` + `file:` で失敗した場合は、`better-sqlite3` の Kysely dialect に切り替えて同じ確認をする（この切り替えは計画内で許可済み）
- [ ] **Step 3: route / proxy / session / login ページ / 仮トップを書く**（`requireUser` を呼ぶ部分は `<Suspense>` 内の async 子コンポーネント）
- [ ] **Step 4: 確認** — `bun run build` が通る。`bun dev` で、未ログインで `/` → `/login`、新規登録 → `/` に名前が出る、ログアウト（仮トップにボタン）→ 再ログインできる。next-dev-loop skill か Playwright で確かめる
- [ ] **Step 5: Commit**（分けて）`chore(ui): shadcn/ui を導入` / `feat(auth): メールとパスワードでのログインを追加`

---

### Task 6: 状態スキーマ・乱数発生スキル・エージェント

**Files:**
- Create: `src/game/schema.ts`, `src/game/fixtures.ts`, `src/game/seeds.ts`, `src/mastra/tools/random-pick.ts`, `src/mastra/tools/random-pick.test.ts`, `src/mastra/agents.ts`, `src/mastra/prompts.ts`
- 依存: `bun add @mastra/core @mastra/libsql zod`

**Interfaces:**
- Consumes: Task 1–3 の型と関数
- Produces（`schema.ts`、Zod 4）:
  - `setupInputSchema`: `{ time, place, player, playerSignature, enemy }` すべて `z.string().max(500)`（空文字可）
  - `actionSchema`（`Action` と同形）、`fighterSchema`
  - `turnLogSchema`: `{ turn: number; enemyTable: Record<Category, number>; enemyAction: Action; playerInput: string; playerAction: Action; result: TurnResult }`
  - `matchStateSchema`:
    ```
    { setting: { time: string; place: string; enemyType: EnemyType; playerSignature: string | null };
      player: Fighter; enemy: Fighter; turn: number;
      status: "in_progress" | "finished";
      pendingEnemy: Action | null; enemyHistory: Action[];
      winner: Side | null; finish: string | null; log: TurnLog[] }
    ```
  - `type MatchState = z.infer<typeof matchStateSchema>`、`type SetupInput`
  - `src/game/fixtures.ts`: テスト用の `sampleState: MatchState`（体力 5/5、turn 1、`pendingEnemy` に通常の打撃技、`log` 1 件）
- Produces（`seeds.ts`）: `SEEDS = { time: string[]; place: string[]; player: string[]; enemy: string[] }` — 各 8 件以上の短い日本語の候補（例: 「真夏の夜」「地方の体育館」「デビュー 2 年目の熱血ベビーフェイス」）
- Produces（`random-pick.ts`）:
  - `randomPickTool = createTool({ id: "random-pick", description: "重み付きの候補表から暗号乱数で 1 つ選ぶ", inputSchema: z.object({ options: z.array(z.object({ label: z.string(), weight: z.number().min(0) })).min(1) }), outputSchema: z.object({ label: z.string(), roll: z.number() }), execute: async ({ options }) => ... })` — 中身は `weightedPick(..., cryptoRng)`
  - `pickWithTool(options: { label: string; weight: number }[]): Promise<{ label: string; roll: number }>` — ワークフローから乱数スキルを呼ぶ唯一の入口。`randomPickTool.execute` を呼ぶ（第 2 引数の形は `node_modules/@mastra/core/dist/docs` で確認する）
- Produces（`agents.ts`）: `analyst`、`narrator`（どちらも `new Agent({ id, name, instructions, model: "google/gemini-3.8-flash" })`）
  - analyst の instructions: プロレスの技の分類者。出力は与えられたスキーマだけ
  - narrator の instructions: 日本語の小説調。地の文に加えて実況アナウンサーと解説者のセリフを交える。数値（体力や確率）は書かない。1 回の描写は 400〜800 字
- Produces（`prompts.ts`、すべて `(...) => string`）:
  - `completeSetupPrompt(input: SetupInput, seeds: Partial<Record<keyof SetupInput, string>>)` → analyst、出力 `{ time, place, playerName, playerDescription, enemyName, enemyDescription, enemyType: EnemyType | "unknown" }`。空欄だけを種から肉付けし、記入済みの欄は書き換えないよう指示する。敵の設定が空欄なら、別途乱数で選んだタイプを種に含める
  - `enemyTablePrompt(state: MatchState)` → analyst、出力 `{ category: Record<Category, number>; grade: Record<Grade, number> }`。タイプの傾向（`ENEMY_TYPE_TENDENCY`）、体力差、性格を考えて重みを付けるよう指示する
  - `enemyMovePrompt(state: MatchState, category: Category, grade: Grade)` → analyst、出力 `{ name: string }`。`enemyHistory` の技名を避けるよう指示する
  - `classifyPrompt(state: MatchState, input: string)` → analyst、出力 `{ name: string; category: Category | "none"; grade: Grade }`。格は技名と動きの大きさで決め、自己申告に従わないこと、`playerSignature` に当たれば finisher、攻撃でなければ `"none"`
  - `finishPrompt(state: MatchState, lastHit: Action)` → analyst、出力 `{ finish: string }`。極め技ならギブアップを基本に、3 カウント・場外負けなどから選ぶ
  - `scenePrompt(state: MatchState, enemyAction: Action)` → narrator。1 ターン目は入場とゴングから。敵の技は名指しせず、構えや気配として予兆を混ぜる
  - `resultPrompt(state: MatchState, log: TurnLog)` → narrator。判定結果（誰の技が決まり、誰が外したか）に沿って書く。決着時は `state.finish` で試合を締める

- [ ] **Step 1: 失敗するテストを書く**

```ts
test("random-pick ツールは候補の中から選ぶ", async () => {
  const labels = new Set<string>();
  for (let i = 0; i < 50; i++) labels.add((await pickWithTool([{ label: "a", weight: 1 }, { label: "b", weight: 1 }])).label);
  expect([...labels].every(l => l === "a" || l === "b")).toBe(true);
});
test("重み 0 の候補は選ばれない", async () => {
  for (let i = 0; i < 20; i++) expect((await pickWithTool([{ label: "a", weight: 0 }, { label: "b", weight: 1 }])).label).toBe("b");
});
test("matchStateSchema は初期状態を受け入れる", () => {
  expect(() => matchStateSchema.parse(sampleState)).not.toThrow();
});
```

- [ ] **Step 2: `bun test src/mastra` → FAIL**
- [ ] **Step 3: 実装**（Mastra の `createTool` / `Agent` の現行シグネチャを embedded docs で確認してから書く）
- [ ] **Step 4: `bun test` → 全 PASS、`bunx tsc --noEmit` が通る**
- [ ] **Step 5: Commit**（分けて）`feat(game): 試合状態のスキーマと空欄補完の種を追加` / `feat(mastra): 乱数発生スキルとエージェントを追加`

---

### Task 7: 試合ワークフロー

**Files:**
- Create: `src/mastra/workflows/match.ts`, `src/mastra/index.ts`, `scripts/smoke-match.ts`

**Interfaces:**
- Consumes: Task 1–4, 6 のすべて
- Produces:
  - `mastra = new Mastra({ agents: { analyst, narrator }, workflows: { match }, storage: new LibSQLStore({ id: "mastra-storage", url: "file:data/mastra.db" }) })`
  - ワークフロー `match`（id `"match"`）: input `setupInputSchema`、output `matchStateSchema`
    - `setup` ステップ: 空欄ごとに `pickWithTool` で `SEEDS` から種を引く。敵の設定が空欄ならタイプも `pickWithTool` で引く → `completeSetupPrompt` → `enemyType` が `"unknown"` なら `pickWithTool` で 4 種から引く → 体力 5 / 最大 5 の `MatchState` を返す（`turn: 0`）
    - `turn` ネストワークフロー（input / output とも `matchStateSchema`）:
      1. `scene`: turn+1 → `enemyTablePrompt` → `adjustCategoryTable(category, enemyHistory の最後の category ?? null)` と `sanitizeWeights(grade)` → `pickWithTool` で種類と格 → `enemyMovePrompt` → `pendingEnemy` に保存 → `scenePrompt` を narrator で stream し、描写を流してから保存する（下記）
      2. `playerAction`: `resumeData` が無ければ `appDb.updateMatch(runId, { status: "awaiting_input", state })` してから `suspend({ turn })`。`resumeSchema: z.object({ text: z.string() })`。resume 後は `{ ...state, playerInput }` を次へ渡す（スキーマに `playerInput` を足した中間スキーマを使う）
      3. `resolve`: `classifyPrompt` → `resolveTurn(..., cryptoRng)` → 体力を反映し `log` に追記、`enemyHistory` に追加、`pendingEnemy = null` → 勝者がいれば `finishPrompt` → `status: "finished"`, `winner`, `finish` → `resultPrompt` を stream。finished なら本文末尾に `\n\n<<END>>` を付けて流す → 保存
    - 本体: `.then(setup).dountil(turn, async ({ inputData }) => inputData.status === "finished").commit()`
  - 描写の流し方と保存（`scene` / `resolve` 共通のヘルパー `narrate(writer, runId, prompt, debug)` を `match.ts` 内に置く）:
    - `writer.custom({ type: "data-narration", data: { kind: "start" } })` → `textStream` の各チャンクで `{ kind: "delta", text }` → 最後に `{ kind: "end" }`。すべて `await` する
    - 全文を `appDb.appendMessage({ matchId: runId, role: "narrator", text, debug })` で保存し、`appDb.updateMatch(runId, { state })` する。`debug` には、そのターンの `enemyTable`、抽選結果、分類、成功率と乱数（`TurnResult.attempts`）を入れる
    - ステップ終了時に `writer.custom({ type: "data-state", data: state })`
  - 各ステップは `retries: 2`
- `scripts/smoke-match.ts`: `mastra.getWorkflow("match").createRun()` → `start({ inputData: 全部空欄 })` → suspended の間は「ドロップキック」「バックドロップ」「様子を見る」「サソリ固め」を順に resume。最大 30 ターン。終了後に検証する:
  - `status === "success"`、`result.status === "finished"`
  - どちらかの体力が 0
  - 最後の narrator メッセージが `<<END>>` で終わる
  - 敵の技の種類が 3 ターン以上連続で同じではない（警告として表示し、失敗にはしない）
  - そのうえで全メッセージを標準出力に出す

- [ ] **Step 1: ワークフロー API（ネストした dountil の中での suspend / resume、`writer.custom`、`run.stream` / `run.resumeStream` で custom チャンクがどう出てくるか）を `node_modules/@mastra/core/dist/docs` で確認し、上の設計と食い違う点があればメモする**
- [ ] **Step 2: `match.ts` と `index.ts` を実装**
- [ ] **Step 3: `bun scripts/smoke-match.ts` → 1 試合が終わり、検証がすべて通る**。出力された描写を読み、日本語の小説調になっているか、数値が本文に出ていないかを確かめる
- [ ] **Step 4: `bun test` と `bunx tsc --noEmit` が通る**
- [ ] **Step 5: Commit** `feat(mastra): 試合のターンを回すワークフローを追加`

---

### Task 8: 試合 API（作成と進行のストリーミング）

**Files:**
- Create: `src/game/client-state.ts`, `src/game/client-state.test.ts`, `src/app/api/matches/route.ts`, `src/app/api/matches/[id]/advance/route.ts`, `src/app/api/matches/[id]/advance/parse.ts`, `src/app/api/matches/[id]/advance/parse.test.ts`

**Interfaces:**
- Consumes: `appDb`（Task 4）、`mastra`（Task 7）、`requireUser` 相当（Route Handler では `auth.api.getSession` を直接呼び、無ければ 401）
- Produces:
  - `isDebug(): boolean` — `process.env.DEBUG_MODE === "true"`（`client-state.ts`）
  - `type ClientState = Omit<MatchState, "pendingEnemy" | "log"> & { pendingEnemy?: Action | null; log?: TurnLog[] }`
  - `toClientState(state: MatchState, debug: boolean): ClientState` — debug false なら `pendingEnemy` と `log` を落とす
  - `parseActionBody(body: unknown): { ok: true; text: string } | { ok: false }` — `{ text: string }`、trim 後 1〜500 文字
  - `POST /api/matches`: body を `setupInputSchema` で検証 → `createMatch({ userId, title: 「{プレイヤー名 or 未定} vs {敵 or 未定}」, setup })` → `{ id }`
  - `POST /api/matches/[id]/advance`: 応答は `application/x-ndjson`。1 行 1 イベント:
    - `{ "type": "message", "role": "narrator" | "player", "text": string }`（player 発言の確定）
    - `{ "type": "delta", "text": string }`（narrator の描写の断片。`data-narration` の start ごとに新しい narrator メッセージが始まる。start は `{ "type": "start" }` として送る）
    - `{ "type": "state", "state": ClientState, "status": MatchStatus }`
    - `{ "type": "debug", "data": unknown }`（DEBUG_MODE 時のみ。narrator メッセージの debug と同じ内容）
    - `{ "type": "error", "message": string }`
  - 進行ルール:
    - 試合が無い / 他人のもの → 404
    - status `new`: body 不要。`claim(id, userId, "new")` → `createRun({ runId: id, resourceId: userId })` → `run.stream({ inputData: setup })`
    - status `awaiting_input`: `parseActionBody` が失敗なら 400。`claim(id, userId, "awaiting_input")` が false なら 409 → player メッセージを `appendMessage` → `{type:"message"}` を送る → `createRun({ runId: id })` → `run.resumeStream({ resumeData: { text } })`（suspended は 1 つなので `step` は省略）
    - それ以外 → 409
    - ストリーム終了時、run の状態が failed なら `updateMatch(id, { status: "failed" })` して error を送る。結果が finished なら `updateMatch(id, { status: "finished", state })`
    - クライアントが切断しても run は最後まで進める（ストリームの読み取りはサーバー側で続ける。描写は DB に保存されるので、再読み込みで見える）

- [ ] **Step 1: 失敗するテストを書く**

```ts
test("デバッグ OFF では敵の行動とログを送らない", () => {
  const c = toClientState({ ...sampleState, pendingEnemy: { name: "ラリアット", category: "strike", grade: "big" } }, false);
  expect("pendingEnemy" in c).toBe(false);
  expect("log" in c).toBe(false);
  expect(toClientState(sampleState, true).pendingEnemy).toEqual(sampleState.pendingEnemy);
});
test("行動入力の検証", () => {
  expect(parseActionBody({ text: "  ドロップキック " })).toEqual({ ok: true, text: "ドロップキック" });
  expect(parseActionBody({ text: "   " }).ok).toBe(false);
  expect(parseActionBody({ text: "あ".repeat(501) }).ok).toBe(false);
  expect(parseActionBody({}).ok).toBe(false);
  expect(parseActionBody(null).ok).toBe(false);
});
```

- [ ] **Step 2: `bun test src/game/client-state.test.ts src/app` → FAIL**
- [ ] **Step 3: 実装**
- [ ] **Step 4: `bun test` → PASS**
- [ ] **Step 5: 確認** — `bun dev` で、ログイン済みの Cookie を付けた curl で試合を作る。`advance` を空 body で叩くと NDJSON が流れ、最後が `status: "awaiting_input"` の state になる。行動を送ると次のターンが流れる。同じ行動を 2 回同時に送ると片方が 409 になる
- [ ] **Step 6: Commit** `feat(api): 試合の作成と進行のストリーミング API を追加`

---

### Task 9: 画面

**Files:**
- Create: `src/app/matches/new/page.tsx`, `src/app/matches/[id]/page.tsx`, `src/components/match/match-chat.tsx`, `src/components/match/hp-bar.tsx`, `src/components/match/debug-panel.tsx`
- Modify: `src/app/page.tsx`
- 依存: `bunx --bun ai-elements@latest add conversation message prompt-input`、`bunx --bun shadcn@latest add textarea progress badge`

**Interfaces:**
- Consumes: Task 4 の `appDb`、Task 5 の `requireUser`、Task 8 の API と `toClientState` / `isDebug`
- Produces:
  - `/`: 自分の試合一覧（タイトル、状態バッジ「進行中」/「終了」/「エラー」、更新日時）と「新しい試合」ボタン、ログアウト
  - `/matches/new`: 項目ごとのフォーム（時刻、場所、プレイヤーの設定、得意技（任意）、敵の設定）。各欄に「空欄なら AI がランダムに決めます」と添える → `POST /api/matches` → `/matches/{id}` へ
  - `/matches/[id]`: サーバー側で `getMatch`（無ければ `notFound()`）、`listMessages`、`toClientState(state, isDebug())` を読み、`<MatchChat>` に渡す
  - `MatchChat` props: `{ matchId: string; initialStatus: MatchStatus; initialState: ClientState | null; initialMessages: { role: "narrator" | "player"; text: string; debug?: unknown }[]; debug: boolean }`
    - 上部に `HpBar`（プレイヤー / 敵の名前、`hp / maxHp`、shadcn `Progress`）
    - 中央に AI Elements の `Conversation` / `Message` / `MessageResponse`。narrator は左、player は右
    - 下部に `PromptInput`。`status !== "awaiting_input"` または通信中は無効。finished なら入力欄の代わりに決着（勝者・`finish`）と「一覧へ戻る」
    - マウント時に `initialStatus === "new"` なら `advance` を空 body で呼ぶ。`running` なら 3 秒ごとに `router.refresh()` して、`awaiting_input` / `finished` になったら止める（切断後の再読み込み用）
    - `advance` の応答は `res.body` を `TextDecoderStream` で読み、改行で区切って `JSON.parse` する。409 なら「処理中です」と表示する
  - `DebugPanel`: `debug` が true のときだけ描画。`pendingEnemy`、最新の debug イベント、状態 JSON を `<details>` で表示

- [ ] **Step 1: 実装**（`requireUser` / `getMatch` を読む部分は `<Suspense>` 内の async 子コンポーネント）
- [ ] **Step 2: `bun run build` と `bun run lint` が通る**
- [ ] **Step 3: ブラウザーで確認**（next-dev-loop skill または Playwright）
  - 新規登録 → 新しい試合（全部空欄）→ 描写がストリーミングで出る → 行動を入力して決着まで遊ぶ → 末尾に `<<END>>`、入力欄が閉じる
  - 試合の途中でタブを閉じる → `/` から開き直すと、それまでの描写があり、入力待ちから続けられる
  - `DEBUG_MODE=true` で再起動 → デバッグパネルに敵の技とテーブルが出る。OFF ではパネルが無く、ネットワーク応答にも `pendingEnemy` が無い
  - 別ユーザーでログインし、最初のユーザーの試合 URL を開く → 404
- [ ] **Step 4: Commit**（分けて）`feat(ui): 試合一覧と状況設定フォームを追加` / `feat(ui): 試合のチャット画面を追加`
