import { expect, test } from "bun:test";
import { sampleState } from "../../game/fixtures";
import { matchStateSchema } from "../../game/schema";
import { pickWithTool } from "./random-pick";

test("random-pick ツールは候補の中から選ぶ", async () => {
  const labels = new Set<string>();
  for (let i = 0; i < 50; i++) labels.add((await pickWithTool([{ label: "a", weight: 1 }, { label: "b", weight: 1 }])).label);
  expect([...labels].every((l) => l === "a" || l === "b")).toBe(true);
});
test("重み 0 の候補は選ばれない", async () => {
  for (let i = 0; i < 20; i++) expect((await pickWithTool([{ label: "a", weight: 0 }, { label: "b", weight: 1 }])).label).toBe("b");
});
test("matchStateSchema は初期状態を受け入れる", () => {
  expect(() => matchStateSchema.parse(sampleState)).not.toThrow();
});
