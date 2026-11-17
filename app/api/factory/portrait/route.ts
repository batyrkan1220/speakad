import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, storeFromUrl, log } from "@/lib/db";
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
      // FLUX 3 Image first (most realistic, ~$0.048 at 1K), then the old models as fallbacks
      ["blackforestlabs/flux-3/text-to-image", { prompt: spec.prompt, aspect_ratio: "9:16", resolution: "1k", output_format: "jpeg", safety_tolerance: 2 }],
      ["fal-ai/nano-banana-pro", { prompt: spec.prompt, aspect_ratio: "9:16", resolution: "2K", num_images: 1, output_format: "jpeg" }],
      ["fal-ai/nano-banana-2", { prompt: spec.prompt, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" }],
      ["fal-ai/flux-2-pro", { prompt: spec.prompt, image_size: "portrait_16_9", output_format: "jpeg" }],
    ];
    let url: string | undefined; let model = ""; let last: unknown;
    for (const [m, input] of tries) {
      try { const r: any = await fal.subscribe(m, { input }); url = r.data?.images?.[0]?.url; model = m; if (url) break; }
      catch (e) { last = e; await log("warn", "POST /api/factory/portrait", `${m} failed, trying next model: ${errMsg(e)}`, { key: spec.key }); }
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
      tone: spec.tone, shot: spec.shot, prompt: spec.prompt, image: url,
      look: { hair: spec.hair, facialHair: spec.facialHair, body: spec.body, features: spec.features, makeup: spec.makeup, outfit: spec.outfit },
    } as ActorPassport;
    p.imageHistory = [...(p.imageHistory || []), { url, model, at: now }];
    p.cost = { ...p.cost, images: +(p.cost.images + (model.includes("flux-3") ? 0.048 : model.includes("pro") && model.includes("banana") ? 0.15 : 0.04)).toFixed(2) };
    await savePassport(p);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
