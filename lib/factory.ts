// "Actor Factory": composes diverse UGC actor specs (person + place + tone) and their image prompts.
import type { Age, Gender } from "./types";

export interface Setting { id: string; label: string; tags: string[]; scene: string; accessories?: string[] }

export const SETTINGS: Setting[] = [
  { id: "living", label: "Living room", tags: ["Home", "Living Room"], scene: "sitting on a cozy couch in a bright, lived-in living room with plants and a lamp behind" },
  { id: "bedroom", label: "Bedroom", tags: ["Home", "Bedroom"], scene: "sitting on an unmade bed in a cozy bedroom with soft morning light from the window" },
  { id: "kitchen", label: "Kitchen", tags: ["Home", "Kitchen"], scene: "standing at the kitchen counter in a modern home kitchen, cups and a fruit bowl in the background" },
  { id: "backyard", label: "Backyard", tags: ["Outside", "Backyard"], scene: "standing in a sunny suburban backyard with green grass, a wooden fence and patio chairs behind" },
  { id: "car", label: "Car", tags: ["Car"], scene: "sitting in the driver's seat of a parked car, seatbelt on, daylight through the windows" },
  { id: "street", label: "Street", tags: ["Outside", "Street"], scene: "standing on a city sidewalk with shop fronts and soft bokeh traffic behind" },
  { id: "gym", label: "Gym", tags: ["Gym"], scene: "in a gym after a workout, weights and machines blurred in the background, slightly sweaty" },
  { id: "office", label: "Home office", tags: ["Home", "Office"], scene: "sitting at a home office desk with a laptop and bookshelf behind" },
  { id: "cafe", label: "Cafe", tags: ["Cafe"], scene: "sitting at a small table in a warm coffee shop with a latte in front" },
  { id: "bathroom", label: "Bathroom", tags: ["Home", "Bathroom"], scene: "in a clean bright bathroom in front of the mirror area, skincare products on the shelf behind" },
  { id: "park", label: "Park", tags: ["Outside", "Park"], scene: "sitting on a bench in a green park with trees and soft sunlight" },
  { id: "podcast", label: "Podcast", tags: ["Studio", "Podcast"], scene: "in a small podcast studio with a microphone on a boom arm in front and acoustic panels behind", accessories: ["Mic"] },
  { id: "balcony", label: "Balcony", tags: ["Outside", "Balcony"], scene: "on an apartment balcony with city buildings and evening golden-hour light behind" },
];

export const TONES = ["Excited", "Enthusiastic", "Happy", "Friendly", "Calm", "Serious", "Curious"] as const;
const TONE_FACE: Record<string, string> = {
  Excited: "bright energetic expression, eyebrows slightly raised",
  Enthusiastic: "warm big smile, lively eyes",
  Happy: "genuine relaxed smile",
  Friendly: "friendly approachable half-smile",
  Calm: "calm soft expression, gentle smile",
  Serious: "focused, trustworthy, neutral expression",
  Curious: "curious, slightly tilted head, interested look",
};

const ETHNICITY = ["White", "Black", "Hispanic", "East Asian", "South Asian", "Middle Eastern", "mixed-race"];
const NAMES: Record<Gender, string[]> = {
  Female: ["Emma", "Olivia", "Ava", "Sophia", "Mia", "Chloe", "Grace", "Zoe", "Hannah", "Maya", "Nora", "Ella", "Ruby", "Leah", "Aria", "Ivy", "Sarah", "Megan", "Priya", "Layla", "Camila", "Jade", "Amara", "Sienna", "Daisy", "Linda", "Carol", "Diane"],
  Male: ["Liam", "Noah", "Ethan", "Lucas", "Mason", "Jack", "Owen", "Leo", "Ryan", "Caleb", "Nathan", "Jordan", "Marcus", "Adam", "Theo", "Dylan", "Omar", "Raj", "Diego", "Kai", "Andre", "Sam", "Harry", "George", "Frank", "Gary", "Peter"],
};
const HAIR: Record<Gender, string[]> = {
  Female: ["long wavy brown hair", "straight blonde hair in a ponytail", "curly dark hair", "short bob haircut", "messy bun", "long black hair", "shoulder-length auburn hair", "braids"],
  Male: ["short brown hair", "buzz cut", "curly hair", "short beard and fade haircut", "slightly messy hair", "clean-shaven with short hair", "stubble and swept-back hair"],
};
const OUTFIT: Record<Gender, string[]> = {
  Female: ["an oversized cream hoodie", "a plain white t-shirt", "a beige knit sweater", "a casual denim jacket", "a black tank top", "a sage green sweatshirt", "a linen button-up shirt"],
  Male: ["a grey hoodie", "a plain black t-shirt", "a navy crewneck sweater", "a flannel shirt", "a white oxford shirt", "an olive overshirt", "a zip-up track jacket"],
};
const AGES: { age: Age; min: number; max: number }[] = [
  { age: "Young Adult", min: 20, max: 29 },
  { age: "Adult", min: 30, max: 48 },
  { age: "Senior", min: 55, max: 70 },
];

export interface ActorSpec {
  key: string; name: string; gender: Gender; age: Age; years: number; ethnicity: string;
  setting: Setting; tone: string; accent: "american" | "british"; prompt: string;
}

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export function buildPrompt(s: Omit<ActorSpec, "prompt" | "key">) {
  const who = s.gender === "Female" ? "woman" : "man";
  const g = s.gender;
  return [
    "Vertical 9:16 smartphone front-camera selfie photo, authentic UGC TikTok style, photorealistic.",
    `A ${s.years}-year-old ${s.ethnicity} ${who} with ${pick(HAIR[g])}, wearing ${pick(OUTFIT[g])},`,
    `${s.setting.scene}.`,
    `${TONE_FACE[s.tone] || "natural expression"}, looking directly into the camera, mouth closed and relaxed.`,
    "Upper body and head centered with headroom, hands relaxed, natural daylight, realistic skin texture with pores,",
    "slight phone-camera grain, not a model photoshoot, no text, no watermark, no logos.",
  ].join(" ");
}

/**
 * Only the number of actors is given; everything else is balanced automatically.
 * Each new actor takes the least-used gender, age, place and tone, counting the
 * existing library plus the actors already planned in this batch (ties broken randomly).
 */
export function makeSpecs(n: number, existing: { gender: string; age: string; situation: string[]; emotion: string }[] = []): ActorSpec[] {
  const use = { gender: new Map<string, number>(), age: new Map<string, number>(), place: new Map<string, number>(), tone: new Map<string, number>(), combo: new Map<string, number>() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const a of existing) {
    inc(use.gender, a.gender); inc(use.age, a.age); inc(use.tone, a.emotion);
    const st = SETTINGS.find((x) => x.tags.every((t) => a.situation.includes(t)));
    if (st) inc(use.place, st.id);
  }
  const least = <T,>(opts: T[], key: (x: T) => string, m: Map<string, number>) => {
    const min = Math.min(...opts.map((o) => m.get(key(o)) || 0));
    return pick(opts.filter((o) => (m.get(key(o)) || 0) === min));
  };
  const used = new Set<string>(existing.map((a: any) => a.name));
  let ukCount = 0;
  return Array.from({ length: n }, (_, i) => {
    const gender = least<Gender>(["Female", "Male"], (g) => g, use.gender);
    const band = least(AGES, (a) => a.age, use.age);
    // place: least used overall, and avoid repeating the same gender+place combo
    const setting = least(SETTINGS, (x) => x.id, new Map(SETTINGS.map((x) => [x.id, (use.place.get(x.id) || 0) * 10 + (use.combo.get(gender + x.id) || 0)])));
    const tone = least([...TONES], (t) => t, use.tone);
    inc(use.gender, gender); inc(use.age, band.age); inc(use.place, setting.id); inc(use.tone, tone); inc(use.combo, gender + setting.id);
    const accent: "american" | "british" = ukCount < Math.round((i + 1) / 3) ? "british" : "american"; // ~1 in 3 UK
    if (accent === "british") ukCount++;
    let name = pick(NAMES[gender]);
    for (let k = 0; k < 20 && used.has(name); k++) name = pick(NAMES[gender]);
    used.add(name);
    const base = { name, gender, age: band.age, years: band.min + Math.floor(Math.random() * (band.max - band.min + 1)), ethnicity: pick(ETHNICITY), setting, tone, accent };
    return { ...base, key: Math.random().toString(36).slice(2, 10), prompt: buildPrompt(base) };
  });
}

/** ElevenLabs Voice Library filters for a spec. */
export const voiceQuery = (s: Pick<ActorSpec, "gender" | "age" | "accent">) => ({
  gender: s.gender.toLowerCase(),
  age: s.age === "Young Adult" ? "young" : s.age === "Senior" ? "old" : "middle_aged",
  accent: s.accent,
});
