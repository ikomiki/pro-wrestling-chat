import { test, expect } from "bun:test";
import { maskSecret } from "./mask";

test("機密値は頭と末尾の 4 文字だけ残す", () => {
  expect(maskSecret("AIzaSyABCDEFGHIJKLMNOP1234")).toBe("AIza…1234");
  expect(maskSecret("short-value")).toBe("****");
});
