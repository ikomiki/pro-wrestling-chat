import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

async function Me() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-4">
      <p>ログイン中: {user.name}</p>
      <SignOutButton />
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <Suspense fallback={<p>読み込み中...</p>}>
        <Me />
      </Suspense>
    </main>
  );
}
