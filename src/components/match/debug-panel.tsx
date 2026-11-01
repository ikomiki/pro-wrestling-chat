import type { ClientState } from "@/game/client-state";
import { CATEGORY_LABEL, GRADE_LABEL, type Category } from "@/game/types";

const json = (v: unknown) => JSON.stringify(v, null, 2);

export function DebugPanel({ state, lastDebug }: { state: ClientState | null; lastDebug: unknown }) {
  const enemy = state?.pendingEnemy;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed p-2 text-xs">
      <p>
        <span className="font-medium">デバッグ / 敵の次の技: </span>
        {enemy
          ? `${enemy.name}（${enemy.category === "none" ? "技なし" : CATEGORY_LABEL[enemy.category as Category]}・${GRADE_LABEL[enemy.grade]}）`
          : "なし"}
      </p>
      <details>
        <summary className="cursor-pointer">最新のデバッグ情報（発生率テーブル・乱数・判定）</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{json(lastDebug)}</pre>
      </details>
      <details>
        <summary className="cursor-pointer">状態 JSON</summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{json(state)}</pre>
      </details>
    </div>
  );
}
