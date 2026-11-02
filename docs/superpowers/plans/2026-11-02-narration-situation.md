# 語り手への状況リスト化・セリフ中心の文体・処理中表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** narrator に過去の文章を渡さず、毎ターン analyst が更新する状況リストと出来事の事実だけで描写させる。あわせて、セリフ中心の文体と差し替え用の文体見本を入れ、AI の処理中は処理名を画面に出す。

**Architecture:**
- `MatchState` に `situation`（7 項目の文字列）を足す。初期値は setup で作り、resolve の判定の後に analyst が 1 回更新する。
- narrator のプロンプトは `src/mastra/prompts.ts` で見出し付きの箇条書きとして組み立てる。
- 処理名は workflow の `writer.custom` → advance route の NDJSON → `match-chat.tsx` の順に流す。

**Tech Stack:** Next.js 16 / Mastra workflows / zod / bun test / Gemini（`google/gemini-3.8-flash`）

**Spec:** `docs/superpowers/specs/2026-11-02-narration-situation-design.md`

## Global Constraints

- narrator のプロンプトに、過去に生成した文章（messages テーブルの text）を含めない。
- narrator のプロンプトに、数値（体力・ターン数・確率）を含めない。既存の `narratorRules` は維持する。
- 状況リストのキー: `crowd` / `position` / `momentum` / `playerMind` / `playerPlan` / `enemyMind` / `enemyPlan`（すべて string）。
- 処理名の文言（そのまま使う）:
  - 「試合の設定を考えています…」
  - 「敵の出方を考えています…」
  - 「技を判定しています…」
  - 「決着を決めています…」
  - 「試合の流れを整理しています…」
- 処理名以外の内容（技名・状況）を、progress イベントで流さない。
- デバッグ OFF の画面には、`situation` を送らない。
- 1 回の描写は 400〜800 字。セリフの割合は数値で指定しない。
- 作業は topic branch `feat/narration-situation` で行い、`design/pro-wrestling-chat` へ `git merge --no-ff` する。コミットはタスクごとに分ける。コードコメントには非自明な WHY だけを書く。

## Review Focus

1. **エラーで終わったとき:** 処理名の表示が残ったままにならない。`error` イベントと advance の `finally` で消す。
2. **step の再試行（`retries: 2`）:** progress と narration の `start` が再送されても、表示は最新の 1 行だけで、吹き出しは重複しない。既存の `liveRef` の置き換えに乗る。
3. **analyst が状況リストに数値や技名を書いたとき:** narrator の描写に数値が漏れない。`narratorRules` に加えて、situationPrompt で「数値と具体的な技名を書かない」と指示する。Task 2 のテストでは、プロンプトが体力の数値を含まないことを確かめる。
4. **リロードしたとき（status が running のポーリング中）:** progress はもう届かないので、従来の「描写を待っています...」に戻る。
5. **決着したターン:** 状況の更新は決着の仕方を決めた後に走る。結果の描写には、勝者と決着の様子が従来どおり入る。

---

### Task 1: MatchState に situation を追加し、クライアントには送らない

**Files:**
- Modify: `src/game/schema.ts`（`matchStateSchema`）
- Modify: `src/game/fixtures.ts`
- Modify: `src/game/client-state.ts`
- Test: `src/game/client-state.test.ts`

**Interfaces:**
- Produces:
  - `situationSchema = z.object({ crowd, position, momentum, playerMind, playerPlan, enemyMind, enemyPlan })`。すべて `z.string()`。
  - `type Situation = z.infer<typeof situationSchema>`
  - `matchStateSchema` に `situation: situationSchema` を追加する。
  - `ClientState` から `situation` を除き、`situation?: Situation` とする。
  - `sampleState.situation` に、それらしい文の値を入れる。

- [ ] **Step 1: 既存のテスト「デバッグ OFF では敵の行動とログを送らない」に assertion を足す**

```ts
expect("situation" in c).toBe(false);
expect(toClientState(sampleState, true).situation).toEqual(sampleState.situation);
```

- [ ] **Step 2: `bun test src/game/client-state.test.ts` を実行し、失敗することを確認する**（型エラーか assertion で FAIL）
- [ ] **Step 3: schema・fixtures・`toClientState` を実装する**（`situation` も除外の分割代入に加える）
- [ ] **Step 4: `bun test` と `bunx tsc --noEmit` を実行する**
  - 期待: テストは PASS。
  - tsc のエラーは、`setupStep` の return に `situation` が無いことによる `src/mastra/workflows/match.ts` だけになる（Task 4 で直す）。
- [ ] **Step 5: Commit** `feat(game): 試合の状態に状況リストを追加する`

### Task 2: プロンプトを状況リスト形式にする

**Files:**
- Modify: `src/mastra/prompts.ts`
- Test: `src/mastra/prompts.test.ts`（新規）

**Interfaces:**
- Consumes: `Situation`, `MatchState`, `TurnLog`（Task 1）
- Produces:
  - `eventsText(log: TurnLog[]): string[]`
    - 1 ターン 1 行。形式は `${turn}: 敵の${名}が決まった / プレイヤーの${名}は外れた`。
    - 相性で潰れた技は「相性で潰された」と書く。
    - プレイヤー側は分類後の `playerAction.name` を使い、`playerInput` は使わない。
  - `scenePrompt(state: MatchState, enemyAction: Action): string`（`prev` 引数を削除する）
  - `resultPrompt(state: MatchState, log: TurnLog): string`（`prev` 引数を削除する）
  - `situationPrompt(state: MatchState, log: TurnLog): string`（analyst 向けの新しいプロンプト）
    - 出力は `situationSchema`。
    - 渡すもの: 更新前の状況リスト、そのターンの判定、`log.playerInput`、両者の状態（`condition()` の言葉）、決着していれば勝者と `finish`。
    - 「数値と具体的な技名を書かない。各項目は 1 文」と指示する。
  - `completeSetupPrompt` の出力欄に、状況リストの初期値（7 項目）を足す。
  - analyst 向けの `situation()` に、`敵の心境` と `敵の方針` の 2 行を足す。
  - `narratorRules` に「敵に具体的な技名や次の一手を言わせない（意気込みや挑発は可）」を 1 行足す。
- narrator 向けのプロンプトの構造は、spec の 2 章の 4 見出しに合わせる: `## 設定` / `## いまの状況` / `## これまでの出来事` / `## この場面で描くこと`。
- 「この場面で描くこと」には、既存の `scenePrompt` / `resultPrompt` の指示（予兆だけ、初回は入場とゴング、判定どおり、誇張しない、決着）を移す。
- 「直前の描写」の行と `prev` を消す。

- [ ] **Step 1: `prompts.test.ts` にテストを書く**

```ts
test("eventsText はターンごとに決まった/外れたを 1 行にする", () => {
  // sampleState.log[0] を、敵の hit=true・プレイヤーの hit=false の attempts に差し替えたログで
  expect(eventsText(log)).toEqual(["0: 敵のミドルキックが決まった / プレイヤーのミドルキックは外れた"]);
});
test("相性で潰された技はそう書く", () => {
  // affinityWinner: "enemy" のログで
  expect(eventsText(log)[0]).toContain("プレイヤーのミドルキックは相性で潰された");
});
test("narrator のプロンプトは状況リストを含み、数値と過去の文章を含まない", () => {
  const p = scenePrompt(sampleState, sampleState.pendingEnemy!);
  expect(p).toContain("## いまの状況");
  expect(p).toContain(sampleState.situation.crowd);
  expect(p).not.toContain("直前の描写");
  expect(p).not.toMatch(/\d+\s*\/\s*\d+/); // 体力 5/5 の形が漏れない
});
```

- [ ] **Step 2: `bun test src/mastra/prompts.test.ts` を実行し、失敗することを確認する**
- [ ] **Step 3: 上の Interfaces どおりに実装する**
- [ ] **Step 4: `bun test` を実行し、PASS することを確認する**
- [ ] **Step 5: Commit** `feat(mastra): 語り手への入力を状況リストと出来事の事実にする`

### Task 3: 文体指示と文体見本

**Files:**
- Create: `src/mastra/style-examples.ts`
- Modify: `src/mastra/agents.ts`（narrator の instructions）

**Interfaces:**
- Produces:
  - `export const STYLE_EXAMPLES: { title: string; input: string; output: string }[]`
  - 2 件（「場面」「結果」）。`input` は Task 2 の 4 見出しの形式で書く。`output` は 400〜800 字。
    - 三人称でプレイヤー寄り。セリフは 4 者（プレイヤー・敵・実況・解説）が話し、心の声は `（）` で書く。
    - 地の文は短く、セリフ中心にする。数値は入れない。
  - ファイルの先頭のコメントは「入力と出力の組を差し替えると narrator の文体が変わる」の 1 行だけにする。

- [ ] **Step 1: narrator の instructions を書き換える**
  - 入れる指示:
    - 三人称でプレイヤーに寄り添う。
    - セリフ中心のライトノベル寄りにする。
    - 4 者のセリフと、プレイヤーの心の声 `（）` を入れる。
    - 心境と方針はセリフと心の声の材料にする。
    - プレイヤーの方針を、プレイヤーの入力より先に行動として描かない。
    - 数値は書かない。400〜800 字。
  - 末尾に「文体の見本（内容は真似せず、文体とセリフの比率だけを真似る）」として、`STYLE_EXAMPLES` を `### 見本: ${title}\n入力:\n${input}\n出力:\n${output}` の形で連結する。
- [ ] **Step 2: `bunx tsc --noEmit` を実行する**（期待: 新しいエラーが出ない）
- [ ] **Step 3: Commit** `feat(mastra): セリフ中心の文体指示と差し替え用の文体見本を追加する`

### Task 4: workflow — 状況の初期化と更新、処理名イベント、過去の文章の廃止

**Files:**
- Modify: `src/mastra/workflows/match.ts`

**Interfaces:**
- Consumes:
  - `situationSchema`（Task 1）
  - `scenePrompt(state, enemyAction)`、`resultPrompt(state, log)`、`situationPrompt(state, log)`（Task 2）
- Produces:
  - NDJSON の元になる `writer.custom({ type: "data-progress", data: { label: string } })`。

- [ ] **Step 1: `lastNarration` を削除し、narrate の呼び出しから `prev` を外す**
  - narrate に渡す debug に `prompt`（narrator に渡した全文）を加える。
- [ ] **Step 2: setup を直す**
  - analyst の structuredOutput の schema に `situation: situationSchema` を足す。
  - return に `situation: s.situation` を入れる。
  - 冒頭（seeds を抽選する前）で progress「試合の設定を考えています…」を流す。
  - setup の execute には `writer` が来るので、引数で受け取る。
- [ ] **Step 3: scene の冒頭で progress「敵の出方を考えています…」を流す**
- [ ] **Step 4: resolve を直す**
  - 冒頭で「技を判定しています…」を流す。
  - 勝者が出たら、finish を求める前に「決着を決めています…」を流す。
  - その後「試合の流れを整理しています…」を流してから、`analyst.generate(situationPrompt(next, log), { structuredOutput: { schema: situationSchema } })` を呼ぶ。
  - `next = { ...next, situation: res.object }` としてから narrate する。
- [ ] **Step 5: `bunx tsc --noEmit && bun test` を実行する**（期待: エラー 0、PASS）
- [ ] **Step 6: Commit** `feat(mastra): 判定後に状況リストを更新し、処理名を流す`

### Task 5: advance route と画面の処理中表示

**Files:**
- Modify: `src/app/api/matches/[id]/advance/route.ts`（`fullStream` のループ）
- Modify: `src/components/match/match-chat.tsx`

**Interfaces:**
- Consumes: `data-progress` チャンク（Task 4）
- Produces: NDJSON の `{ type: "progress", label: string }`

- [ ] **Step 1: route を直す**
  - `chunk.type === "data-progress"` のとき、`send({ type: "progress", label })` を送る。
- [ ] **Step 2: `match-chat.tsx` を直す**
  - `Event` に `{ type: "progress"; label: string }` を足す。
  - `const [progress, setProgress] = useState<string | null>(null)` を足す。
  - `setProgress(null)` するとき:
    - `progress` を受けたら `setProgress(e.label)`。
    - `start`・`state`・`error` を受けたとき。
    - advance の `finally`。
  - 182 行の表示を次のように変える。

    ```tsx
    {busy && (progress ? <p …>{progress}</p> : messages.at(-1)?.role !== "narrator" && <p …>描写を待っています...</p>)}
    ```

    クラスは既存の `text-sm text-muted-foreground` のまま。
- [ ] **Step 3: `bunx tsc --noEmit && bun run lint` を実行する**（期待: エラー 0）
- [ ] **Step 4: Commit** `feat(ui): AI の処理中に処理名を 1 行表示する`

### Task 6: 既存データの作り直しと動作確認

- [ ] **Step 1: 開発サーバーが止まっていることを確認する**
  - 確認したら `rm -f data/app.db data/mastra.db data/mastra.db-shm data/mastra.db-wal` を実行する。
  - `data/auth.db` は残す。
- [ ] **Step 2: `DEBUG_MODE=true` で `bun run dev` を起動し、ブラウザで 1 試合を最後まで進める**
  - 確認すること:
    - (a) 待ち時間に処理名が 1 行出て、文章が流れ始めると消える。
    - (b) 結果の文章の直後にも「敵の出方を考えています…」が出る。
    - (c) デバッグ表示の prompt に「直前の描写」が無く、`## いまの状況` がある。
    - (d) 描写に 4 者のセリフと `（）` の心の声がある。
    - (e) 描写に数値が出ない。
- [ ] **Step 3: 問題がなければ、`design/pro-wrestling-chat` へ `git merge --no-ff feat/narration-situation` する**
  - その前に `git branch --show-current` と `git status` を確認する。
