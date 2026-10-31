import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { cryptoRng, weightedPick } from "../../game/random";

export const randomPickTool = createTool({
  id: "random-pick",
  description: "重み付きの候補表から暗号乱数で 1 つ選ぶ",
  inputSchema: z.object({
    options: z.array(z.object({ label: z.string(), weight: z.number().min(0) })).min(1),
  }),
  outputSchema: z.object({ label: z.string(), roll: z.number() }),
  execute: async ({ options }) => {
    const { value, roll } = weightedPick(
      options.map((o) => ({ value: o.label, weight: o.weight })),
      cryptoRng,
    );
    return { label: value, roll };
  },
});

export async function pickWithTool(
  options: { label: string; weight: number }[],
): Promise<{ label: string; roll: number }> {
  const out = await randomPickTool.execute!({ options }, {});
  // 入力検証に失敗すると throw ではなく { error: true, message } が返る
  if (!out || "error" in out) throw new Error(`random-pick failed: ${JSON.stringify(out)}`);
  return out as { label: string; roll: number };
}
