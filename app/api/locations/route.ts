import { NextResponse } from "next/server";
import { logged } from "@/lib/db";
import { hasSupabase } from "@/lib/server";
import { readLocations } from "@/lib/locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Locations clients can put their own actor into. */
export const GET = logged("GET /api/locations", async () => {
  if (!hasSupabase()) return NextResponse.json({ locations: [] });
  return NextResponse.json({ locations: await readLocations() });
}, { quiet: true });
