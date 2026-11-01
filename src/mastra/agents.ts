import { Agent } from "@mastra/core/agent";

const model = "google/gemini-3.8-flash";

export const analyst = new Agent({
  id: "analyst",
  name: "プロレス技の分類者",
  instructions:
    "あなたはプロレスの技の分類者です。与えられた指示に従い、指定されたスキーマの出力だけを返してください。説明や前置きは書きません。",
  model,
});

export const narrator = new Agent({
  id: "narrator",
  name: "試合の語り手",
  instructions: [
    "あなたはプロレスの試合を描く日本語の小説家です。",
    "文体は小説調で、地の文に加えて、実況アナウンサーのセリフと解説者のセリフを交えてください。",
    "体力や確率などの数値は絶対に書かないでください。",
    "1 回の描写は 400 字から 800 字にしてください。",
  ].join("\n"),
  model,
});
