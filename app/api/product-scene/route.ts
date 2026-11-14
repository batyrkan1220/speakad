import { logged, storeFromUrl } from "@/lib/db";
import { NextResponse } from "next/server";
import { falClient, errMsg, hasSupabase } from "@/lib/server";
import { placementOf } from "@/lib/product";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

// Multi-image editors: image 1 = actor, image 2 = product. First that works wins.
const MODELS = ["fal-ai/nano-banana-2/edit", "fal-ai/nano-banana/edit"];

export const POST = logged("POST /api/product-scene", async (req: Request) => {
  try {
    const { actorImage, productImage, placement, note } = (await req.json()) as {
      actorImage: string; productImage: string; placement?: string; note?: string;
    };
    if (!actorImage || !productImage) throw new Error("Actor image and product image are required");
    const p = placementOf(placement);
    const prompt = [
      "Image 1 is a person in a vertical 9:16 UGC selfie video frame. Image 2 is a product.",
      "Create a new photorealistic vertical 9:16 frame of the SAME person (identical face, hair, skin, clothes, body) in the SAME location and lighting, now with the product from image 2.",
      p.prompt,
      "Keep the product's exact shape, colors, packaging, logo and text. Realistic hand and fingers, correct scale.",
      "Mouth closed or neutral, eyes looking at the camera, natural smartphone look, no text overlays, no watermark.",
      note?.trim() ? `Extra direction: ${note.trim()}` : "",
    ].filter(Boolean).join(" ");

    const fal = falClient();
    let falUrl: string | undefined;
    let lastErr: unknown;
    for (const m of MODELS) {
      try {
        const r: any = await fal.subscribe(m, {
          input: { prompt, image_urls: [actorImage, productImage], num_images: 1, aspect_ratio: "9:16", output_format: "jpeg" },
        });
        falUrl = r.data?.images?.[0]?.url;
        if (falUrl) break;
      } catch (e) { lastErr = e; }
    }
    if (!falUrl) throw lastErr || new Error("No image returned");
    const url = hasSupabase() ? await storeFromUrl(falUrl, "scenes") : falUrl;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
