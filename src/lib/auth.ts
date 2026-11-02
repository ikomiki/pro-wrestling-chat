import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { sqliteUrl } from "../db/path";

export const auth = betterAuth({
  database: { dialect: new LibsqlDialect({ url: sqliteUrl("auth.db") }), type: "sqlite" },
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
