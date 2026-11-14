import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, storeFromUrl } from "@/lib/db";
import { falClient, errMsg, hasSupabase } from "@/lib/server";
import { readPassport, savePassport, type ActorPassport } from "@/lib/passport";
import type { ActorSpec } from "@/lib/factory";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/** Generates a portrait and records it in the actor's passport (every generation is kept). */
export const POST = logged("POST /api/factory/portrait", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const { spec } = (await req.json()) as { spec: ActorSpec };
    if (!spec?.prompt?.trim()) throw new Error("Prompt is empty");
    const fal = falClient();
    const tries: [string, any][] = [
      ["fal-ai/nano-banana-2", { prompt: spec.prompt, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" }],
      ["fal-ai/flux/dev", { prompt: spec.prompt, image_size: "portrait_16_9", num_images: 1 }],
    ];
    let url: string | undefined; let model = ""; let last: unknown;
    for (const [m, input] of tries) {
      try { const r: any = await fal.subscribe(m, { input }); url = r.data?.images?.[0]?.url; model = m; if (url) break; }
      catch (e) { last = e; }
    }
    if (!url) throw last || new Error("No image returned");
    if (!hasSupabase()) return NextResponse.json({ url });
    url = await storeFromUrl(url, "actors");

    const now = new Date().toISOString();
    const prev = await readPassport(spec.key);
    const p: ActorPassport = {
      ...(prev || { id: spec.key, status: "draft", imageHistory: [], cost: { images: 0, audio: 0, video: 0 }, createdAt: now, updatedAt: now }),
      name: spec.name, gender: spec.gender, ageGroup: spec.age, years: spec.years, ethnicity: spec.ethnicity, accent: spec.accent,
      place: { id: spec.setting.id, label: spec.setting.label, tags: spec.setting.tags, accessories: spec.setting.accessories },
      tone: spec.tone, prompt: spec.prompt, image: url,
    } as ActorPassport;
    p.imageHistory = [...(p.imageHistory || []), { url, model, at: now }];
    p.cost = { ...p.cost, images: +(p.cost.images + 0.04).toFixed(2) };
    await savePassport(p);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
