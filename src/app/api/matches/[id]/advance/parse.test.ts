import { test, expect } from "bun:test";
import { parseActionBody } from "./parse";

test("行動入力の検証", () => {
  expect(parseActionBody({ text: "  ドロップキック " })).toEqual({ ok: true, text: "ドロップキック" });
  expect(parseActionBody({ text: "   " }).ok).toBe(false);
  expect(parseActionBody({ text: "あ".repeat(501) }).ok).toBe(false);
  expect(parseActionBody({}).ok).toBe(false);
  expect(parseActionBody(null).ok).toBe(false);
});
