import { NextResponse } from "next/server";
import { loadQueue, saveQueue, withLock } from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** approve | skip | unapprove | edit (script / caption, only before rendering for the script) */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; script?: string; caption?: string };
  return withLock(async () => {
    const q = await loadQueue();
    const it = q.find((x) => x.id === b.id);
    if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ts = new Date().toISOString();
    switch (b.action) {
      case "approve": if (it.status !== "ready") return NextResponse.json({ error: "Only a ready video can be approved" }, { status: 409 }); it.status = "approved"; it.error = undefined; break;
      case "unapprove": if (it.status === "approved") it.status = "ready"; break;
      case "skip": if (["published", "publishing"].includes(it.status)) return NextResponse.json({ error: "Already posting" }, { status: 409 }); it.status = "skipped"; it.error = "Skipped by you"; break;
      case "edit":
        if (typeof b.caption === "string") it.caption = b.caption.slice(0, 2200);
        if (typeof b.script === "string") { if (it.status !== "planned") return NextResponse.json({ error: "The video is already rendered — the script can’t change" }, { status: 409 }); it.script = b.script.slice(0, 5000); }
        break;
      default: return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    it.updatedAt = ts;
    await saveQueue(q);
    return NextResponse.json({ item: it });
  });
}
