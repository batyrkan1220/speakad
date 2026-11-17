import "server-only";
import { readJson, writeJson } from "./db";
import { WELCOME_LINES } from "./factory";

/** Admin-editable Factory settings: the preview line per language, and the language new actors speak. */
export interface FactorySettings {
  lines: Record<string, string>;   // language code → welcome line
  lang: string;                    // "auto" (by the actor's look / market) or a language code
}
const PATH = "factory/settings.json";

export async function readFactorySettings(): Promise<FactorySettings> {
  const s = await readJson<Partial<FactorySettings>>(PATH, {});
  return { lines: { ...WELCOME_LINES, ...(s.lines || {}) }, lang: s.lang || "auto" };
}
export async function saveFactorySettings(next: Partial<FactorySettings>) {
  const cur = await readJson<Partial<FactorySettings>>(PATH, {});
  const merged = { lines: { ...(cur.lines || {}), ...(next.lines || {}) }, lang: next.lang ?? cur.lang ?? "auto" };
  // keep only real overrides (empty text = back to the default)
  for (const [k, v] of Object.entries(merged.lines)) if (!String(v || "").trim()) delete (merged.lines as any)[k];
  await writeJson(PATH, merged);
  return readFactorySettings();
}
/** The line an actor speaks in its preview. */
export async function welcomeFor(lang: string) {
  const s = await readFactorySettings();
  return (s.lines[lang] || WELCOME_LINES[lang as keyof typeof WELCOME_LINES] || WELCOME_LINES.en).trim();
}
