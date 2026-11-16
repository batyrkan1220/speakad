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
    "A real, unretouched smartphone photo (vertical 9:16) of an EMPTY place, as the background of a TikTok / Instagram selfie video — no people at all.",
    `Place: ${scene}.`,
    "Camera at chest height about an arm's length from where a person would stand or sit, looking straight ahead, so a person can later be placed in the centre of the frame.",
    "Lived-in, ordinary and believable — not a showroom, not a hotel, not an advert. Natural ambient light, slight sensor noise, imperfect white balance, mild wide-angle distortion of a phone front camera.",
    "Avoid: people, faces, hands, text, logos, brand names, watermarks, CGI or 3D-render look, HDR, perfect symmetry.",
  ].join(" ");
}

/** Example photo of the place with the same model chain as the actor portraits. */
export async function generateLocationImage(scene: string) {
  const prompt = locationPrompt(scene);
  const fal = falClient();
  const tries: [string, any, number][] = [
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
    "Create a new photorealistic vertical 9:16 smartphone selfie-video frame of the SAME person from image 1 — identical face, facial features, skin, age, hair, body and clothes — now in the place from image 2.",
    `The place: ${loc.scene}. Keep the look, furniture and light of image 2.`,
    "The person holds the phone at arm's length: head with space above the hair, both shoulders and chest down to mid-torso visible, face about a third of the frame height, looking into the lens.",
    "Mouth closed with a natural relaxed expression. Light on the person matches the room. Natural phone-camera look, slight noise.",
    "No text, no logos, no watermark, no extra people, realistic hands.",
  ].join(" ");
}
