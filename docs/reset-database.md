# データベースの作り直し

スキーマを変えたときや、データを初期状態に戻したいときの手順。

各 DB の実際のパスは、アプリの環境変数ページ（`/env`）の「SQLite ファイル」で確認できる。既定ではプロジェクトルートの `data/` に置かれる。

| ファイル | 中身 | テーブルの作られ方 |
|---|---|---|
| `data/auth.db` | Better Auth のユーザーとセッション | `bun run db:migrate` |
| `data/app.db` | 試合とチャットのメッセージ、モデルの思考 | 初回アクセス時に `CREATE TABLE IF NOT EXISTS`（`src/db/app.ts`） |
| `data/mastra.db` | Mastra の workflow の実行状態 | Mastra の起動時に自動作成 |

`app.db` は `CREATE TABLE IF NOT EXISTS` なので、既存テーブルの列を変えてもファイルを消さない限り反映されない。

## 手順

1. `bun dev` と `bunx mastra@latest dev` を止める。動いたままだと、消したファイルを開きっぱなしのプロセスが書き続ける。
2. 作り直したい DB のファイルを消す。`-wal` / `-shm` / `-journal` が残っていれば一緒に消す。

   ```bash
   # すべて
   rm -f data/*.db data/*.db-*

   # 1 つだけ（例: app.db）
   rm -f data/app.db data/app.db-*
   ```

3. `auth.db` を消した場合は認証テーブルを作り直す。

   ```bash
   bun run db:migrate
   ```

4. `bun dev` を起動する。`app.db` と `mastra.db` は自動で作られる。
5. `auth.db` を消した場合は、ログイン画面の「新規登録はこちら」からユーザーを作り直す。

## 注意

- `auth.db` だけを消すと、`app.db` の試合が持つ `user_id` が新しいユーザーと一致せず見えなくなる。ユーザーを作り直すなら `app.db` も消す。
- `TURSO_MASTRA_DATABASE_URL` を設定している場合、Mastra の DB は `data/mastra.db` ではなくその URL 先になる。ファイルを消しても影響しない。
