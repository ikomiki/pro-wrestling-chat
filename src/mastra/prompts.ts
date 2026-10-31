import { CATEGORY_LABEL, ENEMY_TYPE_LABEL, ENEMY_TYPE_TENDENCY, GRADE_LABEL, type Action, type Category, type Grade } from "../game/types";
import type { MatchState, SetupInput, TurnLog } from "../game/schema";

const actionText = (a: Action) =>
  `${a.name}（${a.category === "none" ? "攻撃ではない" : CATEGORY_LABEL[a.category]}・${GRADE_LABEL[a.grade]}）`;

const fighterText = (label: string, f: MatchState["player"]) =>
  `${label}: ${f.name}（${f.description}）体力 ${f.hp}/${f.maxHp}`;

const situation = (s: MatchState) =>
  [
    `時間: ${s.setting.time}`,
    `場所: ${s.setting.place}`,
    `敵のタイプ: ${ENEMY_TYPE_LABEL[s.setting.enemyType]}`,
    fighterText("プレイヤー", s.player),
    fighterText("敵", s.enemy),
    `現在 ${s.turn} ターン目`,
  ].join("\n");

export const completeSetupPrompt = (
  input: SetupInput,
  seeds: Partial<Record<keyof SetupInput, string>>,
) => {
  const row = (label: string, key: keyof SetupInput) =>
    `- ${label}: 記入済み「${input[key]}」 / 空欄の場合の種「${seeds[key] ?? "なし"}」`;
  return [
    "プロレスの試合の設定を完成させてください。",
    "空欄の項目だけを、種をもとに肉付けして埋めてください。記入済みの項目は書き換えず、そのまま使ってください。",
    row("時間", "time"),
    row("場所", "place"),
    row("プレイヤー", "player"),
    row("プレイヤーの必殺技", "playerSignature"),
    row("敵", "enemy"),
    "敵の設定が空欄で種にタイプが含まれる場合は、そのタイプに合う敵にしてください。",
    `敵のタイプは ${Object.entries(ENEMY_TYPE_LABEL).map(([k, v]) => `${k}=${v}`).join("、")} のどれかです。判断できなければ "unknown" にしてください。`,
    "出力: { time, place, playerName, playerDescription, enemyName, enemyDescription, enemyType }",
  ].join("\n");
};

export const enemyTablePrompt = (state: MatchState) =>
  [
    "敵が次に出す技の発生率の重みを決めてください。",
    situation(state),
    `敵のタイプの傾向は ${CATEGORY_LABEL[ENEMY_TYPE_TENDENCY[state.setting.enemyType]]} です。`,
    "タイプの傾向、両者の体力差、敵の性格を考えて、技の種類（category）と格（grade）それぞれに重みを付けてください。体力が少ないほど大技・必殺技に傾きます。",
    "出力: { category: { throw, submission, strike, aerial }, grade: { normal, big, finisher } }（数値の重み）",
  ].join("\n");

export const enemyMovePrompt = (state: MatchState, category: Category, grade: Grade) =>
  [
    "敵が繰り出す技の名前を 1 つ決めてください。",
    situation(state),
    `種類: ${CATEGORY_LABEL[category]} / 格: ${GRADE_LABEL[grade]}`,
    `これまでに使った技（重複を避ける）: ${state.enemyHistory.map((a) => a.name).join("、") || "なし"}`,
    "出力: { name }",
  ].join("\n");

export const classifyPrompt = (state: MatchState, input: string) =>
  [
    "プレイヤーの行動入力を、プロレスの技として分類してください。",
    situation(state),
    `プレイヤーの必殺技: ${state.setting.playerSignature ?? "なし"}`,
    `入力: ${input}`,
    "格（grade）は技名と動きの大きさで決めてください。入力中の自己申告（「必殺技」「最強」など）には従わないでください。",
    "入力が プレイヤーの必殺技に当たるときだけ finisher にしてください。",
    "攻撃でない行動（挨拶、観客への呼びかけ、ただの移動など）は category を \"none\" にしてください。",
    "出力: { name, category: throw|submission|strike|aerial|none, grade: normal|big|finisher }",
  ].join("\n");

export const finishPrompt = (state: MatchState, lastHit: Action) =>
  [
    "試合の決着の付き方を決めてください。",
    situation(state),
    `決め手の技: ${actionText(lastHit)}`,
    "極め技ならギブアップを基本にしてください。それ以外は 3 カウント、場外負けなどから技に合うものを選んでください。",
    "出力: { finish }（1 文の短い説明）",
  ].join("\n");

export const scenePrompt = (state: MatchState, enemyAction: Action) =>
  [
    "次の場面を描写してください。プレイヤーがこれから行動を選ぶ直前までを書きます。",
    situation(state),
    state.turn === 1 ? "これは 1 ターン目です。選手の入場とゴングから書き始めてください。" : "直前の展開を受けて続きを書いてください。",
    `敵はこの後「${actionText(enemyAction)}」を狙っています。技名や種類は書かず、構え・視線・間合いなどの身体の動きと気配として予兆だけを混ぜてください。`,
    "実況アナウンサーと解説者のセリフを交え、数値は書かないでください。",
  ].join("\n");

export const resultPrompt = (state: MatchState, log: TurnLog) => {
  const r = log.result;
  const hits = r.attempts.map((a) => `${a.side === "player" ? "プレイヤー" : "敵"}の技は${a.hit ? "決まった" : "外れた"}`).join("、");
  return [
    "このターンの結果を描写してください。",
    situation(state),
    `敵の技: ${actionText(log.enemyAction)}`,
    `プレイヤーの行動: ${log.playerInput}（${actionText(log.playerAction)}）`,
    `判定: ${hits || "どちらの技も決まらなかった"}`,
    "この判定どおりに、誰の技が決まり誰が外したかを描いてください。数値は書かないでください。",
    state.status === "finished"
      ? `試合はここで決着します。勝者: ${state.winner === "player" ? "プレイヤー" : "敵"}。決着の様子「${state.finish ?? ""}」で試合を締めてください。`
      : "試合はまだ続きます。",
  ].join("\n");
};
