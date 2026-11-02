import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { sqliteUrl } from "../db/path";
import { analyst, narrator } from "./agents";
import { match } from "./workflows/match";

export const mastra = new Mastra({
  agents: { analyst, narrator },
  workflows: { match },
  storage: new LibSQLStore({ id: "mastra-storage", url: process.env.TURSO_MASTRA_DATABASE_URL || sqliteUrl("mastra.db") }),
});
