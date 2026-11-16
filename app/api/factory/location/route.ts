import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged } from "@/lib/db";
import { errMsg } from "@/lib/server";
import { generateLocationImage, updateLocations, readLocations, type Location } from "@/lib/locations";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "place";

/**
 * Admin: create / re-roll / delete locations.
 *  create: { name, scene, tags? } → AI example photo → saved to library/locations.json
 *  reroll: { id }                 → new example photo for the same place
 *  delete: { id }
 */
export const POST = logged("POST /api/factory/location", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const b = (await req.json()) as { action: "create" | "reroll" | "delete"; id?: string; name?: string; scene?: string; tags?: string[] };
    if (b.action === "delete") {
      const list = await updateLocations((l) => l.filter((x) => x.id !== b.id));
      return NextResponse.json({ locations: list });
    }
    if (b.action === "reroll") {
      const loc = (await readLocations()).find((x) => x.id === b.id);
      if (!loc) throw new Error("Unknown location");
      const img = await generateLocationImage(loc.scene);
      const list = await updateLocations((l) => l.map((x) => (x.id === loc.id ? { ...x, image: img.url, cost: +(x.cost + img.cost).toFixed(2) } : x)));
      return NextResponse.json({ locations: list });
    }
    const name = (b.name || "").trim();
    const scene = (b.scene || "").trim() || name;
    if (!name) throw new Error("Name the location");
    const img = await generateLocationImage(scene);
    const loc: Location = {
      id: slug(name) + "-" + Math.random().toString(36).slice(2, 6), name, scene,
      tags: (b.tags?.length ? b.tags : [name]).map((t) => t.trim()).filter(Boolean),
      image: img.url, createdAt: new Date().toISOString(), cost: img.cost,
    };
    const list = await updateLocations((l) => [...l, loc]);
    return NextResponse.json({ locations: list, location: loc });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
