// 短い値は頭と末尾を見せると大半が分かってしまうので、伏せ字だけにする
export function maskSecret(value: string): string {
  if (value.length < 12) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
