import { DAMAGE } from "../game/rules";
import { CATEGORY_LABEL, ENEMY_TYPE_LABEL, ENEMY_TYPE_TENDENCY, GRADE_LABEL, type Action, type Category, type Grade, type Side } from "../game/types";
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

const condition = (f: MatchState["player"]) => {
  const ratio = f.hp / f.maxHp;
  return ratio >= 1 ? "万全" : ratio > 0.6 ? "余裕がある" : ratio > 0.3 ? "消耗している" : ratio > 0 ? "瀕死" : "力尽きた";
};

// 語り手には数値（体力・ターン数）を渡さない。渡すと「第３ラウンド」のように描写へ漏れる
const narratorSituation = (s: MatchState, prev: string | null) =>
  [
    `時間: ${s.setting.time}`,
    `場所: ${s.setting.place}`,
    `プレイヤー: ${s.player.name}（${s.player.description}）状態: ${condition(s.player)}`,
    `敵: ${s.enemy.name}（${s.enemy.description}）タイプ: ${ENEMY_TYPE_LABEL[s.setting.enemyType]} 状態: ${condition(s.enemy)}`,
    ...(prev ? ["直前の描写（これに自然につなげる）:", prev] : []),
  ].join("\n");

const narratorRules = [
  "会場・時刻の説明を繰り返さないでください（最初の場面で一度書けば十分です）。",
  "ラウンドやターン数を書かないでください（プロレスにラウンドはありません）。",
  "数値は書かないでください。",
];

export const scenePrompt = (state: MatchState, enemyAction: Action, prev: string | null) =>
  [
    "次の場面を描写してください。プレイヤーがこれから行動を選ぶ直前までを書きます。",
    narratorSituation(state, prev),
    state.turn === 1
      ? "試合の最初の場面です。会場の様子、選手の入場とゴングから書き始めてください。"
      : "直前の描写の続きを書いてください。入場やゴングはもう済んでいるので書かないでください。",
    `敵はこの後「${actionText(enemyAction)}」を狙っています。技名や種類は書かず、構え・視線・間合いなどの身体の動きと気配として予兆だけを混ぜてください。`,
    "実況アナウンサーと解説者のセリフを交えてください。",
    ...narratorRules,
  ].join("\n");

const SIDE_LABEL: Record<Side, string> = { player: "プレイヤー", enemy: "敵" };
const damageText = (n: number) => (n === 0 ? "ダメージなし" : n === 1 ? "軽いダメージ" : n === 2 ? "大きなダメージ" : "深刻なダメージ");

export const resultPrompt = (state: MatchState, log: TurnLog, prev: string | null) => {
  const r = log.result;
  const actionOf = (side: Side) => (side === "player" ? log.playerAction : log.enemyAction);
  const lines = r.attempts.map((a) => `${SIDE_LABEL[a.side]}の「${actionOf(a.side).name}」は${a.hit ? "決まった" : "外れた"}`);
  if (r.affinityWinner) {
    const loser: Side = r.affinityWinner === "player" ? "enemy" : "player";
    lines.unshift(`${SIDE_LABEL[loser]}の「${actionOf(loser).name}」は相性で潰され、決まらなかった`);
  }
  const taken = (side: Side) =>
    r.attempts.filter((a) => a.hit && a.side !== side).reduce((n, a) => n + DAMAGE[actionOf(a.side).grade], 0);
  return [
    "このターンの結果を描写してください。",
    narratorSituation(state, prev),
    `敵の技: ${actionText(log.enemyAction)}`,
    `プレイヤーの行動: ${log.playerInput}（${actionText(log.playerAction)}）`,
    `判定: ${lines.join("、") || "どちらの技も決まらなかった"}`,
    taken("player") + taken("enemy") === 0
      ? "どちらにもダメージはない。"
      : `受けたダメージ: プレイヤーは${damageText(taken("player"))}、敵は${damageText(taken("enemy"))}`,
    "この判定どおりに、誰の技が決まり誰が外したかを描いてください。決まらなかった技を当たったように書かないでください。",
    "格（通常/大技/必殺技）の表現を誇張しないでください。通常の技を「必殺の」「とどめの」などと書かないでください。",
    ...narratorRules,
    state.status === "finished"
      ? `試合はここで決着します。勝者: ${state.winner === "player" ? "プレイヤー" : "敵"}。決着の様子「${state.finish ?? ""}」で試合を締めてください。`
      : "試合はまだ続きます。",
  ].join("\n");
};
