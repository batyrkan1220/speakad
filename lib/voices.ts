import "server-only";
import { readJson, writeJson } from "./db";
import { addSharedVoice, searchSharedVoices, errMsg } from "./server";

const VOICE_MAP = "factory/voice-map.json";      // Voice Library id -> id in our ElevenLabs account
const NATIVE_MAP = "voices/native-map.json";     // "<actorId>|<lang>" -> account voice id
const adding = new Map<string, Promise<string>>();

/** Add a Voice Library voice to our account once (no custom slot) and reuse it afterwards. */
export async function accountVoiceFor(ownerId: string, sharedId: string, name: string): Promise<string> {
  const map = await readJson<Record<string, string>>(VOICE_MAP, {});
  if (map[sharedId]) return map[sharedId];
  if (!adding.has(sharedId)) {
    adding.set(sharedId, (async () => {
      let id = "";
      for (let i = 0; i < 4 && !id; i++) {
        try { id = await addSharedVoice(ownerId, sharedId, `SpeakAd · ${name}`.slice(0, 60)); }
        catch (e) {
          if (!/same voice|retry|already/i.test(errMsg(e)) || i === 3) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
          const again = await readJson<Record<string, string>>(VOICE_MAP, {});
          if (again[sharedId]) return again[sharedId];
        }
      }
      const fresh = await readJson<Record<string, string>>(VOICE_MAP, {});
      fresh[sharedId] = id;
      await writeJson(VOICE_MAP, fresh);
      return id;
    })().finally(() => setTimeout(() => adding.delete(sharedId), 5000)));
  }
  return adding.get(sharedId)!;
}

const AGE: Record<string, string> = { "Young Adult": "young", Adult: "middle_aged", Senior: "old", Kid: "young" };

/**
 * A native-speaker voice for this actor in `lang` (same sex, similar age) from the ElevenLabs Voice Library.
 * Picked once per actor + language and remembered, so the actor always sounds the same in that language.
 */
export async function nativeVoiceFor(actor: { id: string; name: string; gender?: string; age?: string }, lang: string): Promise<string | null> {
  const key = `${actor.id}|${lang}`;
  const map = await readJson<Record<string, string>>(NATIVE_MAP, {});
  if (map[key]) return map[key];
  const gender = actor.gender?.toLowerCase() === "male" ? "male" : "female";
  const tries = [
    { language: lang, gender, age: AGE[actor.age || ""] || undefined },
    { language: lang, gender },
  ];
  let pick: { id: string; ownerId: string; name: string } | undefined;
  for (const q of tries) {
    const found = await searchSharedVoices(q as any, 10).catch(() => []);
    // prefer voices other actors are not already using in this language
    const used = new Set(Object.entries(map).filter(([k]) => k.endsWith(`|${lang}`)).map(([, v]) => v));
    const vmap = await readJson<Record<string, string>>(VOICE_MAP, {});
    pick = found.find((v: any) => !used.has(vmap[v.id])) || found[0];
    if (pick) break;
  }
  if (!pick) return null;
  const voiceId = await accountVoiceFor(pick.ownerId, pick.id, `${actor.name} ${lang.toUpperCase()}`);
  const fresh = await readJson<Record<string, string>>(NATIVE_MAP, {});
  fresh[key] = voiceId;
  await writeJson(NATIVE_MAP, fresh);
  return voiceId;
}
