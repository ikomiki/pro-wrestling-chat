import type { MatchState, Situation, TurnLog } from "./schema";
import type { Action } from "./types";

export const isDebug = () => process.env.DEBUG_MODE === "true";

export type ClientState = Omit<MatchState, "pendingEnemy" | "log" | "situation"> & {
  pendingEnemy?: Action | null;
  log?: TurnLog[];
  situation?: Situation;
};

export function toClientState(state: MatchState, debug: boolean): ClientState {
  if (debug) return state;
  const { pendingEnemy: _p, log: _l, situation: _s, ...rest } = state;
  return rest;
}
