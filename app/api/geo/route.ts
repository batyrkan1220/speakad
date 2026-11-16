import { NextResponse } from "next/server";
import { COUNTRY_LANG } from "@/lib/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { country: string; at: number }>();

/** Visitor's country from the IP (CDN header if present, otherwise a GeoIP lookup) → suggested language. */
export async function GET(req: Request) {
  const h = req.headers;
  let country = (h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || "").toUpperCase();
  if (!country || country === "XX") {
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "";
    const hit = ip && cache.get(ip);
    if (hit && Date.now() - hit.at < 864e5) country = hit.country;
    else if (ip && !/^(127\.|10\.|192\.168\.|::1)/.test(ip)) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const j = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`, { signal: ctl.signal, cache: "no-store" }).then((r) => r.json());
        clearTimeout(t);
        if (j?.success && j.country_code) { country = String(j.country_code).toUpperCase(); cache.set(ip, { country, at: Date.now() }); }
      } catch { /* lookup failed → fall back to the browser language on the client */ }
    }
  }
  return NextResponse.json({ country: country || null, lang: (country && COUNTRY_LANG[country]) || null });
}
