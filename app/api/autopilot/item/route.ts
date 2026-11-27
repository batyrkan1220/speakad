import { NextResponse } from "next/server";
import { loadQueue, saveQueue, withLock, loadCfg, normalizeCfg, remember, draftScript, nextActor, nextVariety } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * approveScript | regenerate | approve | unapprove | skip | edit | feedback
 * Scripts are cheap and editable until rendering starts; feedback + edits feed the account's style memory.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; script?: string; caption?: string; rating?: "up" | "down"; reason?: string; newActor?: boolean };
  return withLock(async () => {
    const q = await loadQueue();
    const it = q.find((x) => x.id === b.id);
    if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bad = (m: string) => NextResponse.json({ error: m }, { status: 409 });
    switch (b.action) {
      case "approveScript":
        if (it.status !== "draft") return bad("This script is already approved");
        it.status = "planned"; it.error = undefined;
        await remember(it.accountId, (m) => m.liked.push({ lineId: it.lineId, script: it.script }));
        break;
      case "regenerate": {
        if (!["draft", "planned"].includes(it.status)) return bad("The video is already being made");
        const c = normalizeCfg((await loadCfg())[it.accountId] || {});
        const line = c.lines.find((l) => l.id === it.lineId);
        const recent = q.filter((x) => x.accountId === it.accountId && x.id !== it.id);
        if (b.reason) await remember(it.accountId, (m) => m.disliked.push({ lineId: it.lineId, script: it.script, reason: b.reason }));
        const { angle, format } = nextVariety([...recent, it]);
        const actor = b.newActor ? nextActor(c, [...recent, it], line, it.actor.id) : it.actor;
        const d = await draftScript(it.accountId, c, line, angle, format, actor);
        Object.assign(it, { angle, format, actor, script: d.script, caption: d.caption, status: c.scriptApproval ? "draft" : "planned", error: undefined });
        break;
      }
      case "approve": if (it.status !== "ready") return bad("Only a ready video can be approved"); it.status = "approved"; it.error = undefined; break;
      case "unapprove": if (it.status === "approved") it.status = "ready"; break;
      case "skip":
        if (["published", "publishing"].includes(it.status)) return bad("Already posting");
        if (b.reason) await remember(it.accountId, (m) => m.disliked.push({ lineId: it.lineId, script: it.script, reason: b.reason }));
        it.status = "skipped"; it.error = "Skipped by you"; break;
      case "edit":
        if (typeof b.caption === "string") it.caption = b.caption.slice(0, 2200);
        if (typeof b.script === "string" && b.script !== it.script) {
          if (!["draft", "planned"].includes(it.status)) return bad("The video is already rendered — the script can’t change");
          const before = it.script;
          it.script = b.script.slice(0, 5000);
          await remember(it.accountId, (m) => m.edits.push({ before, after: it.script }));
        }
        break;
      case "feedback":
        if (b.rating !== "up" && b.rating !== "down") return NextResponse.json({ error: "rating must be up or down" }, { status: 400 });
        it.feedback = { rating: b.rating, reason: b.reason?.slice(0, 120) };
        await remember(it.accountId, (m) => (b.rating === "up" ? m.liked.push({ lineId: it.lineId, script: it.script }) : m.disliked.push({ lineId: it.lineId, script: it.script, reason: b.reason })));
        break;
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    it.updatedAt = new Date().toISOString();
    await saveQueue(q);
    return NextResponse.json({ item: it });
  });
}
