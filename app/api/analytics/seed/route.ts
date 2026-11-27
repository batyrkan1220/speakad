import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { seedMock } from "@/lib/analytics/sync";
import { tablesExist } from "@/lib/analytics/repo";
import { readJson } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/analytics/seed — write the demo dataset into Postgres (after the migration ran). */
export async function POST(req: Request) {
  if (!isAdmin(req)) return forbidden();
  if (!(await tablesExist())) return NextResponse.json({ error: "Run the migration SQL first" }, { status: 409 });
  try {
    const lib = await readJson<{ name: string; image?: string; video?: string; parentId?: string }[]>("library/actors.json", []).catch(() => []);
    return NextResponse.json(await seedMock(lib.filter((a) => a.image && a.video && !a.parentId).map((a) => ({ name: a.name, image: a.image }))));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
