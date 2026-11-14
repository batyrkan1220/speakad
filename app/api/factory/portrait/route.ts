import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, storeFromUrl } from "@/lib/db";
import { falClient, errMsg, hasSupabase } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

export const POST = logged("POST /api/factory/portrait", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const { prompt } = (await req.json()) as { prompt: string };
    if (!prompt?.trim()) throw new Error("Prompt is empty");
    const fal = falClient();
    const tries: [string, any][] = [
      ["fal-ai/nano-banana-2", { prompt, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" }],
      ["fal-ai/flux/dev", { prompt, image_size: "portrait_16_9", num_images: 1 }],
    ];
    let url: string | undefined; let last: unknown;
    for (const [m, input] of tries) {
      try { const r: any = await fal.subscribe(m, { input }); url = r.data?.images?.[0]?.url; if (url) break; }
      catch (e) { last = e; }
    }
    if (!url) throw last || new Error("No image returned");
    return NextResponse.json({ url: hasSupabase() ? await storeFromUrl(url, "actors") : url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
