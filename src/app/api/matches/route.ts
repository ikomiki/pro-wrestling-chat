import { appDb } from "@/db/app";
import { setupInputSchema } from "@/game/schema";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });
  const parsed = setupInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const setup = parsed.data;
  const title = `${setup.player.trim() || "未定"} vs ${setup.enemy.trim() || "未定"}`;
  const id = await appDb.createMatch({ userId: session.user.id, title, setup });
  return Response.json({ id });
}
