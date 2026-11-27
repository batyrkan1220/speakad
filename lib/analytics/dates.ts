import type { Filter } from "./types";

const DAY = 86400000;
export const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The equal-length window right before the filter window (for period-over-period deltas). */
export function prevRangeOf(f: Pick<Filter, "from" | "to">) {
  const a = Date.parse(f.from + "T00:00:00Z"), b = Date.parse(f.to + "T00:00:00Z");
  const len = Math.round((b - a) / DAY) + 1;
  return { pFrom: isoDay(a - len * DAY), pTo: isoDay(a - DAY), len };
}

/** Parse ?from&to&accounts&avatars&granularity with safe defaults (last 30 days, max 180). */
export function parseFilter(sp: URLSearchParams): Filter {
  const today = isoDay(Date.now());
  const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  let to = ok(sp.get("to")) || today;
  if (to > today) to = today;
  let from = ok(sp.get("from")) || isoDay(Date.parse(to) - 29 * DAY);
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 180 * DAY) from = isoDay(Date.parse(to) - 180 * DAY);
  const list = (k: string) => (sp.get(k) || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const span = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  const granularity = sp.get("granularity") === "hour" && span <= 3 ? "hour" : "day";
  return { from, to, accounts: list("accounts"), avatars: list("avatars"), granularity };
}
