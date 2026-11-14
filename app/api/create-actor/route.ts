import { logged, storeFromUrl } from "@/lib/db";
import { NextResponse } from "next/server";
import { falClient, IMAGE_MODEL, EDIT_MODEL, errMsg, hasSupabase } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const STYLE =
  ", vertical 9:16 smartphone selfie, UGC style, natural light, looking at camera, photorealistic, upper body";

export const POST = logged("POST /api/create-actor", async (req: Request) => {
  try {
    const { prompt, referenceUrl, raw } = (await req.json()) as { prompt: string; referenceUrl?: string; raw?: boolean };
    const full = raw ? prompt : prompt + STYLE;
    if (!prompt?.trim()) throw new Error("Describe the actor");
    const fal = falClient();
    const r: any = referenceUrl
      ? await fal.subscribe(EDIT_MODEL, {
          input: { prompt: full, image_url: referenceUrl, aspect_ratio: "9:16" },
        })
      : await fal.subscribe(IMAGE_MODEL, {
          input: { prompt: full, image_size: "portrait_16_9", num_images: 1 },
        });
    const falUrl = r.data?.images?.[0]?.url;
    if (!falUrl) throw new Error("No image returned");
    const url = hasSupabase() ? await storeFromUrl(falUrl, "actors") : falUrl;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
