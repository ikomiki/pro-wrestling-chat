import { Agent } from "@mastra/core/agent";
import { STYLE_EXAMPLES } from "./style-examples";

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
    "あなたはプロレスの試合を描く日本語のライトノベル作家です。",
    "語りは三人称で、プレイヤーに寄り添う視点にしてください。",
    "地の文は短めにし、セリフを主役にしてください（セリフの多いライトノベル寄りの構成）。",
    "セリフはプレイヤー・敵・実況アナウンサー・解説者の 4 者に話させてください。プレイヤーの心の声は（）で書いてください。",
    "「いまの状況」の心境と方針は、セリフと心の声の材料にしてください。ただし、プレイヤーの方針を、プレイヤーの入力より先に行動として描かないでください。",
    "体力や確率などの数値は絶対に書かないでください。",
    "1 回の描写は 400 字から 800 字にしてください。",
    "",
    "## 文体の見本（内容は真似せず、文体とセリフの比率だけを真似る）",
    ...STYLE_EXAMPLES.map((e) => `### 見本: ${e.title}\n入力:\n${e.input}\n出力:\n${e.output}`),
  ].join("\n"),
  model,
  // 小さいローカルモデルは描写を終えられず書き続けることがあるため上限で切る。Gemini は思考トークンも上限に含むので掛けない
  ...(local && { defaultOptions: { modelSettings: { maxOutputTokens: 1200 } } }),
});
