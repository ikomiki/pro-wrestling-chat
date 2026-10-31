export function parseActionBody(body: unknown): { ok: true; text: string } | { ok: false } {
  const raw = (body as { text?: unknown } | null)?.text;
  if (typeof raw !== "string") return { ok: false };
  const text = raw.trim();
  return text.length >= 1 && text.length <= 500 ? { ok: true, text } : { ok: false };
}
