import { NextResponse } from "next/server";
import { logged, storeFromUrl } from "@/lib/db";
import { falClient, errMsg, hasSupabase } from "@/lib/server";
import { readLocations, placePrompt } from "@/lib/locations";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const MODELS = ["fal-ai/nano-banana-2/edit", "fal-ai/nano-banana/edit"];

/** Put the client's own actor (photo) into one of the Factory locations. */
export const POST = logged("POST /api/locations/place", async (req: Request) => {
  try {
    const { actorImage, locationId } = (await req.json()) as { actorImage: string; locationId: string };
    if (!actorImage || !locationId) throw new Error("Actor photo and location are required");
    const loc = (await readLocations()).find((l) => l.id === locationId);
    if (!loc) throw new Error("Unknown location");
    const fal = falClient();
    let url: string | undefined; let last: unknown;
    for (const m of MODELS) {
      try {
        const r: any = await fal.subscribe(m, { input: { prompt: placePrompt(loc), image_urls: [actorImage, loc.image], num_images: 1, aspect_ratio: "9:16", output_format: "jpeg" } });
        url = r.data?.images?.[0]?.url;
        if (url) break;
      } catch (e) { last = e; }
    }
    if (!url) throw last || new Error("No image returned");
    if (hasSupabase()) url = await storeFromUrl(url, "actors");
    return NextResponse.json({ url, tags: loc.tags });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
