import { NextResponse } from "next/server";
import { falClient, errMsg, hasSupabase } from "@/lib/server";
import { storeFromUrl, logged } from "@/lib/db";
import { clientActorPrompt } from "@/lib/factory";

export const runtime = "nodejs";
export const maxDuration = 120;

/** "Generate with AI" in Create actor: a realistic UGC actor photo (FLUX 3, fallbacks). */
export const POST = logged("POST /api/actor-ai", async (req: Request) => {
  try {
    const b = (await req.json()) as { gender?: string; age?: string; description?: string };
    const gender = b.gender === "Female" ? "Female" : "Male";
    const age = b.age === "30s" || b.age === "40s" ? b.age : "20s";
    const { prompt, years, situation, shot } = clientActorPrompt({ gender, age, description: b.description });
    const fal = falClient();
    const tries: [string, any][] = [
      ["blackforestlabs/flux-3/text-to-image", { prompt, aspect_ratio: "9:16", resolution: "1k", output_format: "jpeg" }],
      ["fal-ai/nano-banana-2", { prompt, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" }],
    ];
    let url: string | undefined; let last: unknown;
    for (const [m, input] of tries) {
      try { const r: any = await fal.subscribe(m, { input }); url = r.data?.images?.[0]?.url; if (url) break; } catch (e) { last = e; }
    }
    if (!url) throw last || new Error("No image returned");
    if (hasSupabase()) url = await storeFromUrl(url, "actors");
    return NextResponse.json({ url, years, situation, shot, gender });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
