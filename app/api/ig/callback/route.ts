import { NextResponse } from "next/server";
import { loadAccounts, saveAccounts, origin } from "@/lib/igaccounts";
import { log } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth return: code → short token → 60-day token → profile → save the account. */
export async function GET(req: Request) {
  const base = origin(req), sp = new URL(req.url).searchParams;
  const back = (q: string) => { const r = NextResponse.redirect(`${base}/?ig=${q}`); r.cookies.set("ig_state", "", { path: "/", maxAge: 0 }); return r; };
  const cookie = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ig_state=([^;]+)/)?.[1];
  if (sp.get("error")) return back("cancelled");
  if (!sp.get("code") || !cookie || cookie !== sp.get("state")) return back("failed");
  try {
    const form = new URLSearchParams({
      client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, grant_type: "authorization_code",
      redirect_uri: base + "/api/ig/callback", code: sp.get("code")!.replace(/#_$/, ""),
    });
    const short = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }).then((r) => r.json());
    if (!short.access_token) throw new Error(short.error_message || "No access token");
    const long = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(process.env.META_APP_SECRET!)}&access_token=${encodeURIComponent(short.access_token)}`).then((r) => r.json());
    const token: string = long.access_token || short.access_token;
    const me = await fetch(`https://graph.instagram.com/v23.0/me?fields=user_id,username,profile_picture_url,followers_count&access_token=${encodeURIComponent(token)}`).then((r) => r.json());
    if (!me.username) throw new Error(me.error?.message || "Could not read the profile");
    const xs = await loadAccounts();
    const handle = String(me.username).toLowerCase();
    const prev = xs.find((a) => a.handle === handle || (me.user_id && a.igUserId === String(me.user_id)));
    const acc = {
      id: prev?.id || "ig" + Date.now().toString(36), handle, igUserId: String(me.user_id || short.user_id || ""),
      picture: me.profile_picture_url, followers: me.followers_count, status: "connected" as const, token,
      tokenExpiresAt: new Date(Date.now() + (long.expires_in || 3600) * 1000).toISOString(), actorIds: prev?.actorIds || [],
      connectedAt: new Date().toISOString(),
    };
    await saveAccounts(prev ? xs.map((a) => (a.id === prev.id ? acc : a)) : [...xs, acc]);
    return back("connected&acc=" + acc.id);
  } catch (e) {
    await log("error", "ig/callback", (e as Error).message);
    return back("failed");
  }
}
