import { Agent } from "@mastra/core/agent";

const env = process.env;
const local = env.AI_PROVIDER === "openai-compatible";
const model =
  local
    ? {
        providerId: "openai-compatible",
        modelId: env.AI_MODEL ?? "",
        url: env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:1234/v1",
        apiKey: env.OPENAI_COMPATIBLE_API_KEY,
      }
    : (`google/${env.AI_MODEL || "gemini-3.8-flash"}` as const);

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
  // 小さいローカルモデルは描写を終えられず書き続けることがあるため上限で切る。Gemini は思考トークンも上限に含むので掛けない
  ...(local && { defaultOptions: { modelSettings: { maxOutputTokens: 2000 } } }),
});
