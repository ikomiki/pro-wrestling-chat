import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { mkdirSync } from "node:fs";
import { analyst, narrator } from "./agents";
import { match } from "./workflows/match";

// libsql は親ディレクトリを作らないので、未作成だと file:data/mastra.db を開けない
mkdirSync("data", { recursive: true });

export const mastra = new Mastra({
  agents: { analyst, narrator },
  workflows: { match },
  storage: new LibSQLStore({ id: "mastra-storage", url: "file:data/mastra.db" }),
});
