import { NextResponse } from "next/server";
import { KEEP_IDENTITY, REAL_SKIN, REAL_FRAME, REAL_AVOID } from "@/lib/realism";
import { logged, storeFromUrl } from "@/lib/db";
import { falClient, errMsg, hasSupabase } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const MODELS = ["fal-ai/nano-banana-2/edit", "fal-ai/nano-banana/edit"];

/** New look for an actor: same person, a described change (place, outfit, hair…), optional reference photo. */
export const POST = logged("POST /api/look", async (req: Request) => {
  try {
    const b = (await req.json()) as { image: string; change: string; ref?: string };
    const change = (b.change || "").trim().slice(0, 600);
    if (!b.image) throw new Error("No actor photo");
    if (!change && !b.ref) throw new Error("Describe what to change");
    const prompt = [
      "Image 1 is a real person in a vertical 9:16 frame from a phone video.",
      "Make a NEW photorealistic frame of this person.", KEEP_IDENTITY, "(Only what the change asks for may differ.)",
      `Change: ${change || "use the place / outfit shown in image 2"}.`,
      b.ref ? "Image 2 is a reference for the change (place, outfit or object) — follow it." : "",
      "Keep the camera distance, angle and framing of image 1 (head with space above, body visible as before), looking into the lens, mouth closed, natural relaxed expression; no phone or outstretched arm in the frame.",
      "Light on the person matches the new setting.", REAL_SKIN, REAL_FRAME, REAL_AVOID,
    ].filter(Boolean).join(" ");
    const fal = falClient();
    let url: string | undefined; let last: unknown;
    for (const m of MODELS) {
      try {
        const r: any = await fal.subscribe(m, { input: { prompt, image_urls: b.ref ? [b.image, b.ref] : [b.image], num_images: 1, aspect_ratio: "9:16", output_format: "jpeg" } });
        url = r.data?.images?.[0]?.url;
        if (url) break;
      } catch (e) { last = e; }
    }
    if (!url) throw last || new Error("No image returned");
    if (hasSupabase()) url = await storeFromUrl(url, "actors");
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
