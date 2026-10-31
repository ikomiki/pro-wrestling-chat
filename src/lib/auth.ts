import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { LibsqlDialect } from "@libsql/kysely-libsql";

export const auth = betterAuth({
  database: { dialect: new LibsqlDialect({ url: "file:data/auth.db" }), type: "sqlite" },
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
