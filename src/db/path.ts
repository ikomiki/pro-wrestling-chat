import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Next はコードを .next/ 配下にバンドルするので __dirname / import.meta は元のディレクトリを指さない。
// 起動ディレクトリ（プロジェクトルート）基準の絶対パスに固定する。libsql は親ディレクトリを作らないので先に作る
export function sqliteUrl(name: string): string {
  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return `file:${join(dir, name)}`;
}
