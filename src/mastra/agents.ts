import { Agent, type AgentExecutionOptions } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { STYLE_EXAMPLES } from "./style-examples";

const env = process.env;
const local = env.AI_PROVIDER === "openai-compatible";
// 思考を reasoning_content で返さず本文に <think> で混ぜるサーバーがある。本文から切り出して reasoning として扱う
const model =
  local
    ? wrapLanguageModel({
        model: createOpenAICompatible({
          name: "openai-compatible",
          baseURL: env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:1234/v1",
          apiKey: env.OPENAI_COMPATIBLE_API_KEY,
          supportsStructuredOutputs: true,
        }).chatModel(env.AI_MODEL ?? ""),
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      })
    : (`google/${env.AI_MODEL || "gemini-3.8-flash"}` as const);

// サーバーごとに効く指定が違うので、効きうるものを全部送る。知らないフィールドは各サーバーが無視する
// - reasoning_effort: Ollama・llama.cpp・vLLM（"none" で無効）、LM Studio 0.4.8 以降
// - chat_template_kwargs.enable_thinking: vLLM・SGLang・llama.cpp の Qwen3 / Qwen3.5 テンプレート
// - /no_think: 初代 Qwen3 のみ。Qwen3.5 は無視する
// Gemini 3 は思考を完全には止められないので、off は最も軽い low にする
const thinking = env.AI_THINKING || undefined;
const providerOptions: AgentExecutionOptions["providerOptions"] = !thinking
  ? undefined
  : local
    ? {
        openaiCompatible: {
          reasoningEffort: thinking === "off" ? "none" : thinking,
          chat_template_kwargs: { enable_thinking: thinking !== "off" },
        },
      }
    : { google: { thinkingConfig: { thinkingLevel: thinking === "off" ? "low" : (thinking as "minimal" | "low" | "medium" | "high") } } };
const noThink = local && thinking === "off" ? "\n/no_think" : "";

export const analyst = new Agent({
  id: "analyst",
  name: "プロレス技の分類者",
  instructions:
    "あなたはプロレスの技の分類者です。与えられた指示に従い、指定されたスキーマの出力だけを返してください。説明や前置きは書きません。" + noThink,
  model,
  defaultOptions: { providerOptions },
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
  ].join("\n") + noThink,
  model,
  defaultOptions: {
    providerOptions,
    // 小さいローカルモデルは描写を終えられず書き続けることがあるため上限で切る。Gemini は思考トークンも上限に含むので掛けない
    ...(local && { modelSettings: { maxOutputTokens: 1200 } }),
  },
});
