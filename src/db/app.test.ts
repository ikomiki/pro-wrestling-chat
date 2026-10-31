import { test, expect } from "bun:test";
import { createAppDb, isStaleRunning } from "./app";

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
test("5 分以上更新のない running だけが止まった扱いになる", async () => {
  const db = createAppDb(":memory:");
  const id = await db.createMatch({ userId: "u1", title: "t", setup: {} });
  await db.claim(id, "u1", "new");
  const m = (await db.getMatch(id, "u1"))!;
  const t = Date.parse(m.updatedAt);
  expect(isStaleRunning(m, t + 60_000)).toBe(false);
  expect(isStaleRunning(m, t + 6 * 60_000)).toBe(true);
  expect(isStaleRunning({ ...m, status: "awaiting_input" }, t + 6 * 60_000)).toBe(false);
});
