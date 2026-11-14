import "server-only";
import { db, BUCKET, readJson, writeJson } from "./db";

/** Full record ("passport") of every actor the factory generates — kept in Supabase Storage. */
export interface ActorPassport {
  id: string;                // factory key; library actor id is "lib-" + id
  status: "draft" | "approved" | "rejected";
  name: string;
  gender: string;            // Female | Male
  ageGroup: string;          // Young Adult | Adult | Senior
  years: number;             // exact age
  ethnicity: string;
  accent: string;            // american | british
  place: { id: string; label: string; tags: string[]; accessories?: string[] };
  tone: string;              // persona emotion
  look?: { hair: string; facialHair: string; body: string; features: string[]; makeup: string; outfit: string };
  prompt: string;
  image?: string;            // current portrait (Supabase)
  imageHistory: { url: string; model?: string; at: string }[];
  voice?: { id: string; name: string; ownerId?: string; shared?: boolean; preview?: string; labels?: Record<string, unknown> };
  voicePreview?: string;     // copy of the voice's sample (Supabase)
  audio?: string;            // the actor's welcome line in its own voice + tone (Supabase)
  audioText?: string;
  video?: string;            // preview talking video (Supabase)
  libraryId?: string;
  cost: { images: number; audio: number; video: number }; // USD estimates
  createdAt: string;
  updatedAt: string;
}

const dir = "factory/actors";
export const passportPath = (id: string) => `${dir}/${id}.json`;

export const readPassport = (id: string) => readJson<ActorPassport | null>(passportPath(id), null);

export async function savePassport(p: ActorPassport) {
  p.updatedAt = new Date().toISOString();
  await writeJson(passportPath(p.id), p);
  return p;
}

export async function listPassports(limit = 500): Promise<ActorPassport[]> {
  const { data, error } = await db().storage.from(BUCKET).list(dir, { limit, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(error.message);
  const files = (data || []).filter((f) => f.name.endsWith(".json"));
  const out = await Promise.all(files.map((f) => readJson<ActorPassport | null>(`${dir}/${f.name}`, null)));
  return out.filter(Boolean) as ActorPassport[];
}
