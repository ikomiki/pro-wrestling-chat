import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requireUser(): Promise<{ id: string; name: string; email: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { id, name, email } = session.user;
  return { id, name, email };
}
