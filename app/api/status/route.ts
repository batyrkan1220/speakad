import { NextResponse } from "next/server";
import { falClient, OMNIHUMAN, errMsg } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const fal = falClient();
    const s: any = await fal.queue.status(OMNIHUMAN, { requestId: id });
    if (s.status === "COMPLETED") {
      const r: any = await fal.queue.result(OMNIHUMAN, { requestId: id });
      return NextResponse.json({ status: "done", videoUrl: r.data?.video?.url, duration: r.data?.duration });
    }
    return NextResponse.json({ status: "rendering", queue: s.queue_position ?? null });
  } catch (e) {
    return NextResponse.json({ status: "error", error: errMsg(e) });
  }
}
