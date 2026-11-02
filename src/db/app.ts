import { createClient } from "@libsql/client";
import { sqliteUrl } from "./path";

export type MatchStatus = "new" | "running" | "awaiting_input" | "finished" | "failed";
export type MatchRow = {
  id: string; userId: string; title: string; status: MatchStatus;
  state: unknown | null; setup: unknown; createdAt: string; updatedAt: string;
};
export type MessageRow = {
  id: number; matchId: string; role: "narrator" | "player";
  text: string; debug: unknown | null; createdAt: string;
};
export type AppDb = ReturnType<typeof createAppDb>;

// 進行中にサーバーが落ちると running のまま誰も更新しなくなる。1 ターンの処理はこれより十分短い
const STALE_RUNNING_MS = 5 * 60 * 1000;
export const isStaleRunning = (m: MatchRow, now = Date.now()) =>
  m.status === "running" && now - Date.parse(m.updatedAt) > STALE_RUNNING_MS;

const parse = (v: unknown) => (v == null ? null : JSON.parse(String(v)));

export function createAppDb(url: string) {
  const client = createClient({ url });
  const ready = client
    .batch([
      `CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
        status TEXT NOT NULL, state TEXT, setup TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL,
        role TEXT NOT NULL, text TEXT NOT NULL, debug TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS reasonings (
        id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL,
        label TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`,
    ])
    .then(() => {});

  const toMatch = (r: Record<string, unknown>): MatchRow => ({
    id: r.id as string, userId: r.user_id as string, title: r.title as string,
    status: r.status as MatchStatus, state: parse(r.state), setup: parse(r.setup),
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  });

  return {
    ready,
    async createMatch(input: { userId: string; title: string; setup: unknown }) {
      await ready;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await client.execute({
        sql: "INSERT INTO matches (id, user_id, title, status, setup, created_at, updated_at) VALUES (?, ?, ?, 'new', ?, ?, ?)",
        args: [id, input.userId, input.title, JSON.stringify(input.setup), now, now],
      });
      return id;
    },
    async getMatch(id: string, userId: string): Promise<MatchRow | null> {
      await ready;
      const rs = await client.execute({ sql: "SELECT * FROM matches WHERE id = ? AND user_id = ?", args: [id, userId] });
      return rs.rows[0] ? toMatch(rs.rows[0]) : null;
    },
    async listMatches(userId: string): Promise<MatchRow[]> {
      await ready;
      const rs = await client.execute({ sql: "SELECT * FROM matches WHERE user_id = ? ORDER BY created_at DESC, rowid DESC", args: [userId] });
      return rs.rows.map(toMatch);
    },
    async updateMatch(id: string, patch: { status?: MatchStatus; state?: unknown; title?: string }) {
      await ready;
      const sets = ["updated_at = ?"];
      const args: (string | null)[] = [new Date().toISOString()];
      if (patch.status !== undefined) { sets.push("status = ?"); args.push(patch.status); }
      if (patch.state !== undefined) { sets.push("state = ?"); args.push(JSON.stringify(patch.state)); }
      if (patch.title !== undefined) { sets.push("title = ?"); args.push(patch.title); }
      await client.execute({ sql: `UPDATE matches SET ${sets.join(", ")} WHERE id = ?`, args: [...args, id] });
    },
    async claim(id: string, userId: string, from: MatchStatus) {
      await ready;
      const rs = await client.execute({
        sql: "UPDATE matches SET status = 'running', updated_at = ? WHERE id = ? AND user_id = ? AND status = ?",
        args: [new Date().toISOString(), id, userId, from],
      });
      return rs.rowsAffected === 1;
    },
    async appendMessage(input: { matchId: string; role: "narrator" | "player"; text: string; debug?: unknown }) {
      await ready;
      await client.execute({
        sql: "INSERT INTO messages (match_id, role, text, debug, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [input.matchId, input.role, input.text, input.debug === undefined ? null : JSON.stringify(input.debug), new Date().toISOString()],
      });
    },
    async appendReasoning(input: { matchId: string; label: string; text: string }) {
      await ready;
      await client.execute({
        sql: "INSERT INTO reasonings (match_id, label, text, created_at) VALUES (?, ?, ?, ?)",
        args: [input.matchId, input.label, input.text, new Date().toISOString()],
      });
    },
    async listMessages(matchId: string): Promise<MessageRow[]> {
      await ready;
      const rs = await client.execute({ sql: "SELECT * FROM messages WHERE match_id = ? ORDER BY id ASC", args: [matchId] });
      return rs.rows.map(r => ({
        id: Number(r.id), matchId: r.match_id as string, role: r.role as MessageRow["role"],
        text: r.text as string, debug: parse(r.debug), createdAt: r.created_at as string,
      }));
    },
  };
}

// 遅延生成: import だけで data/app.db を作らない（テストは :memory: のみ使う）
let singleton: AppDb | undefined;
export const appDb: AppDb = new Proxy({} as AppDb, {
  get(_, k) {
    if (!singleton) {
      singleton = createAppDb(sqliteUrl("app.db"));
    }
    return singleton[k as keyof AppDb];
  },
});
