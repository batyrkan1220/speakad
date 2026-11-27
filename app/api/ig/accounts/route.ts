import { NextResponse } from "next/server";
import { loadAccounts, saveAccounts, publicAccount, oauthReady, cleanHandle } from "@/lib/igaccounts";
import { hasSupabase } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List connected Instagram accounts (no tokens). */
export async function GET() {
  if (!hasSupabase()) return NextResponse.json({ accounts: [], oauth: oauthReady(), storage: false });
  return NextResponse.json({ accounts: (await loadAccounts()).map(publicAccount), oauth: oauthReady(), storage: true });
}

/** Add an account by @handle (before the Meta app is set up it waits as "pending"). */
export async function POST(req: Request) {
  const { handle } = (await req.json().catch(() => ({}))) as { handle?: string };
  const h = cleanHandle(handle || "");
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return NextResponse.json({ error: "Enter an Instagram username, e.g. @mybrand" }, { status: 400 });
  const xs = await loadAccounts();
  if (xs.some((a) => a.handle === h)) return NextResponse.json({ error: `@${h} is already added` }, { status: 409 });
  const acc = { id: "ig" + Date.now().toString(36), handle: h, status: "pending" as const, actorIds: [], connectedAt: new Date().toISOString() };
  await saveAccounts([...xs, acc]);
  return NextResponse.json({ account: publicAccount(acc) });
}

/** Assign the actors that work on an account. */
export async function PATCH(req: Request) {
  const { id, actorIds } = (await req.json().catch(() => ({}))) as { id?: string; actorIds?: string[] };
  const xs = await loadAccounts();
  const a = xs.find((x) => x.id === id);
  if (!a) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  a.actorIds = (actorIds || []).filter((x) => typeof x === "string").slice(0, 12);
  await saveAccounts(xs);
  return NextResponse.json({ account: publicAccount(a) });
}

/** Disconnect: removes the account and its token from FaceAd (videos stay). */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const xs = await loadAccounts();
  await saveAccounts(xs.filter((x) => x.id !== id));
  return NextResponse.json({ ok: true });
}
