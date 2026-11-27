import { readFile } from "fs/promises";
import path from "path";
import { isAdmin, forbidden } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The migration SQL, so the admin can paste it into the Supabase SQL editor. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return forbidden();
  const sql = await readFile(path.join(process.cwd(), "supabase/migrations/20261127000000_analytics.sql"), "utf8").catch(() => "-- migration file not found");
  return new Response(sql, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
