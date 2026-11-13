import { NextResponse } from "next/server";
import { falClient, OMNIHUMAN, errMsg, hasSupabase } from "@/lib/server";
import { db, log, storeFromUrl } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "GET /api/status";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    // Already finished and stored? Answer from the database.
    if (hasSupabase()) {
      const { data } = await db().from("generations").select("status, video_url, duration").eq("request_id", id).maybeSingle();
      if (data?.status === "done" && data.video_url?.includes("/storage/v1/object/public/"))
        return NextResponse.json({ status: "done", videoUrl: data.video_url, duration: data.duration == null ? undefined : Number(data.duration) });
    }

    const fal = falClient();
    const s: any = await fal.queue.status(OMNIHUMAN, { requestId: id });
    if (s.status !== "COMPLETED") return NextResponse.json({ status: "rendering", queue: s.queue_position ?? null });

    const t0 = Date.now();
    const r: any = await fal.queue.result(OMNIHUMAN, { requestId: id });
    let videoUrl: string | undefined = r.data?.video?.url;
    const duration: number | undefined = r.data?.duration;
    if (!videoUrl) throw new Error("fal returned no video");

    if (hasSupabase()) {
      // fal result URLs are temporary: keep our own copy.
      videoUrl = await storeFromUrl(videoUrl, "videos");
      await db().from("generations").update({ status: "done", video_url: videoUrl, duration: duration ?? null, error: null }).eq("request_id", id);
      await log("info", ROUTE, "video stored", { requestId: id, videoUrl, duration }, Date.now() - t0);
    }
    return NextResponse.json({ status: "done", videoUrl, duration });
  } catch (e) {
    const m = errMsg(e);
    await log("error", ROUTE, m, { requestId: id });
    if (hasSupabase()) await db().from("generations").update({ status: "error", error: m }).eq("request_id", id).neq("status", "done");
    return NextResponse.json({ status: "error", error: m });
  }
}
