import type { MatchState, TurnLog } from "./schema";
import type { Action } from "./types";

export const isDebug = () => process.env.DEBUG_MODE === "true";

export type ClientState = Omit<MatchState, "pendingEnemy" | "log"> & { pendingEnemy?: Action | null; log?: TurnLog[] };

export function toClientState(state: MatchState, debug: boolean): ClientState {
  if (debug) return state;
  const { pendingEnemy: _p, log: _l, ...rest } = state;
  return rest;
}
