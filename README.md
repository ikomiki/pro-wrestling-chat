# pro-wrestling-chat

1 対 1 のターン制プロレスをチャットで遊ぶゲーム。実況は小説風の日本語で、AI（Gemini または OpenAI 互換のローカルモデル）が書く。乱数は Mastra のツールが `crypto` で引く。

ローカルでの利用を想定しているため、ガードレールは入れていない。

## 技術スタック

- Next.js 16（App Router、`cacheComponents`）
- Mastra（agent・workflow・tool）、モデルは Gemini か OpenAI 互換サーバー
- Better Auth（メールアドレスとパスワード）
- libSQL（SQLite ファイル）
- shadcn/ui、AI Elements

パッケージ管理とスクリプト実行には bun だけを使う。

## セットアップ

```bash
bun install
cp .env.example .env.local   # 値を埋める
bun run db:migrate           # 認証テーブルを作る
bun dev
```

http://localhost:3000 を開き、ログイン画面の「新規登録はこちら」からユーザーを作る。

### 環境変数（`.env.local`）

| 変数 | 内容 |
|---|---|
| `AI_PROVIDER` | `gemini`（既定）か `openai-compatible`（LM Studio・Ollama など） |
| `AI_MODEL` | モデル ID。Gemini の既定は `gemini-3.8-flash`。`openai-compatible` では必須（`/v1/models` が返す ID） |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini の API キー。`gemini` のときだけ使う |
| `OPENAI_COMPATIBLE_BASE_URL` | OpenAI 互換サーバーの URL。既定は `http://localhost:1234/v1`（LM Studio）。Ollama は `http://localhost:11434/v1` |
| `OPENAI_COMPATIBLE_API_KEY` | OpenAI 互換サーバーの API キー。ローカルサーバーなら空でよい |
| `BETTER_AUTH_SECRET` | セッション署名用の秘密値（例: `openssl rand -base64 32`） |
| `BETTER_AUTH_URL` | アプリの URL。通常は `http://localhost:3000` |
| `DEBUG_MODE` | `true` で試合画面にデバッグパネルを出し、敵の次の手と判定ログを返す |

## スクリプト

| コマンド | 内容 |
|---|---|
| `bun dev` | 開発サーバー |
| `bun run build` / `bun start` | 本番ビルドと起動 |
| `bun test` | ユニットテスト |
| `bun run lint` | ESLint |
| `bunx tsc --noEmit` | 型検査 |
| `bun run db:migrate` | Better Auth のテーブルを作成・更新する |
| `bun scripts/smoke-match.ts` | ブラウザーを使わずに 1 試合を最後まで流す。AI を呼ぶので、Gemini では費用がかかる |

## データ

すべて `data/` に置く（git 管理外）。消せば初期状態に戻る。消した後は `bun run db:migrate` をやり直す。

| ファイル | 中身 |
|---|---|
| `data/auth.db` | Better Auth のユーザーとセッション |
| `data/app.db` | 試合とチャットのメッセージ |
| `data/mastra.db` | Mastra の workflow の実行状態 |

## ディレクトリ

| パス | 役割 |
|---|---|
| `src/game/` | ルール、相性と成功率、敵の行動テーブル、乱数、状態のスキーマ |
| `src/mastra/` | agent（実況と技の分類）、プロンプト、乱数ツール、試合 workflow |
| `src/db/app.ts` | 試合とメッセージの読み書き |
| `src/lib/` | Better Auth のサーバー・クライアント設定、セッション取得 |
| `src/app/api/matches/` | 試合の作成と進行の API（NDJSON でストリーミングする） |
| `src/app/` | 画面（トップ、ログイン、新規試合、試合） |
| `src/components/match/` | 試合のチャット、HP バー、デバッグパネル |
| `src/proxy.ts` | 未ログイン時にログイン画面へ転送する |
| `docs/superpowers/` | 設計書と実装計画 |

## ゲームの仕組み

試合は Mastra の workflow で進める。初期設定を作った後、1 ターンを次の 3 段で繰り返す。

1. 場面の描写
2. プレイヤーの行動入力。ここで workflow を中断して入力を待つ
3. 判定と実況

ルールの要点は次のとおり。

- 相性は「投げ > 打撃 > 関節 > 投げ」の三すくみで、空中技は相性を持たない
- 成功率は、守る側の残り HP の割合で決まる
- HP は 5 から始まり、ダメージは 1〜3

遊ぶ人向けのルール説明は `docs/20261101-game-rules.html`（ブラウザーで直接開く）。

細かい仕様は `docs/superpowers/specs/` の設計書を参照。
