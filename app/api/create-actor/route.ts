import { logged, storeFromUrl } from "@/lib/db";
import { NextResponse } from "next/server";
import { falClient, IMAGE_MODEL, EDIT_MODEL, errMsg, hasSupabase } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// Same realism rules as the Actor Factory, for actors described by the user.
const STYLE =
  ". A real, unretouched vertical 9:16 smartphone front-camera selfie, UGC style, not a model or a photoshoot. " +
  "Face true to the person's age (wrinkles, lines and grey hair where the age calls for them), visible pores, peach fuzz, slight facial asymmetry, " +
  "natural ambient light, mild sensor noise, looking straight into the lens with lips closed, shoulders and upper chest in frame. " +
  "Avoid airbrushed or plastic skin, beauty filters, studio lighting, CGI look, text and watermarks.";

export const POST = logged("POST /api/create-actor", async (req: Request) => {
  try {
    const { prompt, referenceUrl, raw } = (await req.json()) as { prompt: string; referenceUrl?: string; raw?: boolean };
    const full = raw ? prompt : prompt + STYLE;
    if (!prompt?.trim()) throw new Error("Describe the actor");
    const fal = falClient();
    const r: any = referenceUrl
      ? await fal.subscribe(EDIT_MODEL, {
          input: { prompt: full, image_urls: [referenceUrl], aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" },
        })
      : await fal.subscribe(IMAGE_MODEL, {
          input: { prompt: full, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" },
        });
    const falUrl = r.data?.images?.[0]?.url;
    if (!falUrl) throw new Error("No image returned");
    const url = hasSupabase() ? await storeFromUrl(falUrl, "actors") : falUrl;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
