import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { maskSecret } from "@/lib/mask";

const VARS: { name: string; secret?: boolean }[] = [
  { name: "AI_PROVIDER" },
  { name: "AI_MODEL" },
  { name: "GOOGLE_GENERATIVE_AI_API_KEY", secret: true },
  { name: "OPENAI_COMPATIBLE_BASE_URL" },
  { name: "OPENAI_COMPATIBLE_API_KEY", secret: true },
  { name: "BETTER_AUTH_SECRET", secret: true },
  { name: "BETTER_AUTH_URL" },
  { name: "MASTRA_PLATFORM_ACCESS_TOKEN", secret: true },
  { name: "MASTRA_PROJECT_ID" },
  { name: "DEBUG_MODE" },
  { name: "NODE_ENV" },
];

async function EnvTable() {
  // requireUser が headers() を読むので、以降の process.env はビルド時ではなくリクエスト時の値になる
  await requireUser();
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y">
        {VARS.map(({ name, secret }) => {
          const value = process.env[name];
          return (
            <tr key={name}>
              <th className="py-2 pr-4 text-left font-mono font-medium">{name}</th>
              <td className="py-2 font-mono break-all">
                {value ? (secret ? maskSecret(value) : value) : <span className="text-muted-foreground">（未設定）</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function EnvPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">環境変数</h1>
      <p className="text-sm text-muted-foreground">API キーなどの機密値は頭と末尾の 4 文字だけを表示する。</p>
      <Suspense fallback={<p className="text-muted-foreground">読み込み中...</p>}>
        <EnvTable />
      </Suspense>
    </main>
  );
}
