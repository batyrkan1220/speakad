import { NextResponse } from "next/server";
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
      "Image 1 is a real person in a vertical 9:16 smartphone selfie video frame.",
      "Make a NEW photorealistic frame of the SAME person — identical face, facial features, skin, age, body and hair unless asked otherwise.",
      `Change: ${change || "use the place / outfit shown in image 2"}.`,
      b.ref ? "Image 2 is a reference for the change (place, outfit or object) — follow it." : "",
      "Keep the UGC selfie framing: phone at arm's length, head with space above, both shoulders and chest visible, looking into the lens, mouth closed, natural expression.",
      "Light on the person matches the new setting. Natural phone-camera look. No text, no logos, no watermark, no extra people.",
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
