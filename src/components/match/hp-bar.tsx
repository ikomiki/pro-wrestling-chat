import { Progress } from "@/components/ui/progress";
import type { Fighter } from "@/game/types";

function Gauge({ fighter, label }: { fighter: Fighter; label: string }) {
  const hp = Math.max(0, fighter.hp);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">
          <span className="text-xs text-muted-foreground">{label} </span>
          <span className="font-medium">{fighter.name}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          {hp} / {fighter.maxHp}
        </span>
      </div>
      <Progress value={(hp / fighter.maxHp) * 100} className="h-2" aria-label={`${fighter.name} の体力`} />
    </div>
  );
}

export function HpBar({ player, enemy }: { player: Fighter; enemy: Fighter }) {
  return (
    <div className="flex gap-6">
      <Gauge fighter={player} label="あなた" />
      <Gauge fighter={enemy} label="相手" />
    </div>
  );
}
