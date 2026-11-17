import { KEEP_IDENTITY, REAL_SKIN, REAL_FRAME, REAL_AVOID } from "./realism";
import { readJson, writeJson, storeFromUrl, log } from "@/lib/db";
import { falClient, errMsg, hasSupabase } from "@/lib/server";

/** A place a client can put their own actor into (made in the Factory, shown in "Create actor"). */
export interface Location {
  id: string;
  name: string;
  scene: string;      // what the place looks like (English, used in prompts)
  tags: string[];     // picker "Situation" tags given to actors placed here
  image: string;      // AI example photo of the empty place, vertical 9:16
  createdAt: string;
  cost: number;       // $ spent on example photos
}

const PATH = "library/locations.json";
export const readLocations = () => readJson<Location[]>(PATH, []);

let queue: Promise<unknown> = Promise.resolve();
/** Serialized read-modify-write, so parallel creates don't overwrite each other. */
export function updateLocations(fn: (l: Location[]) => Location[]) {
  const run = queue.then(async () => { const next = fn(await readLocations()); await writeJson(PATH, next); return next; });
  queue = run.catch(() => {});
  return run;
}

export function locationPrompt(scene: string) {
  return [
    "A real, unretouched smartphone photo (vertical 9:16) of an EMPTY place, as the background of a TikTok / Instagram video — no people at all.",
    `Place: ${scene}.`,
    "Camera on a tripod at eye level about 1.5 m from where a person would sit or stand, looking straight ahead, so a person can later be placed in the centre of the frame.",
    "Lived-in, ordinary and believable — real everyday objects, slight clutter, not a showroom, not a hotel, not an advert. Natural window or daylight, slight phone-camera grain, true-to-life colours.",
    "Avoid: people, faces, hands, text, logos, brand names, watermarks, CGI or 3D-render look, HDR, perfect symmetry.",
  ].join(" ");
}

/** Example photo of the place with the same model chain as the actor portraits. */
export async function generateLocationImage(scene: string) {
  const prompt = locationPrompt(scene);
  const fal = falClient();
  const tries: [string, any, number][] = [
    ["blackforestlabs/flux-3/text-to-image", { prompt, aspect_ratio: "9:16", resolution: "1k", output_format: "jpeg" }, 0.048],
    ["fal-ai/nano-banana-pro", { prompt, aspect_ratio: "9:16", resolution: "2K", num_images: 1, output_format: "jpeg" }, 0.15],
    ["fal-ai/nano-banana-2", { prompt, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" }, 0.04],
  ];
  let last: unknown;
  for (const [m, input, cost] of tries) {
    try {
      const r: any = await fal.subscribe(m, { input });
      const url = r.data?.images?.[0]?.url;
      if (url) return { url: hasSupabase() ? await storeFromUrl(url, "locations") : url, cost };
    } catch (e) { last = e; await log("warn", "locations", `${m} failed: ${errMsg(e)}`); }
  }
  throw last || new Error("No image returned");
}

/** Prompt for putting the client's own actor (image 1) into a location (image 2). */
export function placePrompt(loc: Location) {
  return [
    "Image 1 is a real person. Image 2 is a place.",
    "Create a new photorealistic vertical 9:16 phone-video frame of the person from image 1, now in the place from image 2.", KEEP_IDENTITY, "Same clothes.",
    `The place: ${loc.scene}. Keep the look, furniture and light of image 2.`,
    "Keep the camera distance, angle and pose of image 1 (head with space above the hair, body visible as before), looking into the lens; no phone or outstretched arm in the frame.",
    "Mouth closed with a natural relaxed expression. The light, colour and shadows on the person match the place so they truly sit in it (not pasted on).",
    REAL_SKIN, REAL_FRAME, REAL_AVOID,
  ].join(" ");
}
