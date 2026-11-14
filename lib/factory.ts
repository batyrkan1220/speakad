// "Actor Factory": composes diverse UGC actor specs (person + place + tone) and their image prompts.
import type { Age, Gender } from "./types";

export interface Setting { id: string; label: string; weight: number; tags: string[]; scene: string; accessories?: string[] }

// weight = target share of the library (from studying the market: most UGC is shot sitting at home,
// then in the car, outside / walking, kitchen, podcast & interview sets).
export const SETTINGS: Setting[] = [
  { id: "living", label: "Living room", weight: 18, tags: ["Home", "Living Room", "Sitting"], scene: "sitting on a cozy couch in a bright, lived-in living room with plants and a lamp behind" },
  { id: "bedroom", label: "Bedroom", weight: 8, tags: ["Home", "Bedroom", "Sitting"], scene: "sitting on an unmade bed in a cozy bedroom with soft morning light from the window" },
  { id: "kitchen", label: "Kitchen", weight: 8, tags: ["Home", "Kitchen"], scene: "standing at the kitchen counter in a modern home kitchen, cups and a fruit bowl in the background" },
  { id: "bathroom", label: "Bathroom", weight: 4, tags: ["Home", "Bathroom"], scene: "in a clean bright bathroom in front of the mirror area, skincare products on the shelf behind" },
  { id: "office", label: "Home office", weight: 5, tags: ["Home", "Office", "Sitting"], scene: "sitting at a home office desk with a laptop and bookshelf behind" },
  { id: "car", label: "Car", weight: 12, tags: ["Car", "Sitting"], scene: "sitting in the driver's seat of a parked car, seatbelt on, daylight through the windows" },
  { id: "street", label: "Street", weight: 8, tags: ["Outside", "Street"], scene: "standing on a city sidewalk with shop fronts and soft bokeh traffic behind" },
  { id: "walking", label: "Walking", weight: 6, tags: ["Outside", "Walking", "Movement"], scene: "walking on a sunny neighborhood sidewalk holding the phone at arm's length, trees and houses behind, slight motion" },
  { id: "backyard", label: "Backyard", weight: 4, tags: ["Outside", "Backyard"], scene: "standing in a sunny suburban backyard with green grass, a wooden fence and patio chairs behind" },
  { id: "nature", label: "Nature", weight: 7, tags: ["Outside", "Nature"], scene: "outdoors on a trail in a green park with trees and soft golden sunlight behind" },
  { id: "balcony", label: "Balcony", weight: 2, tags: ["Outside", "Balcony"], scene: "on an apartment balcony with city buildings and evening golden-hour light behind" },
  { id: "gym", label: "Gym", weight: 4, tags: ["Gym"], scene: "in a gym after a workout, weights and machines blurred in the background, slightly sweaty" },
  { id: "cafe", label: "Coffee shop", weight: 2, tags: ["Coffee Shop", "Sitting"], scene: "sitting at a small table in a warm coffee shop with a latte in front" },
  { id: "podcast", label: "Podcast", weight: 6, tags: ["Podcast", "Studio"], scene: "in a small podcast studio with a microphone on a boom arm in front and acoustic panels behind", accessories: ["Mic"] },
  { id: "interview", label: "Interview", weight: 4, tags: ["Interview", "Studio", "Formal", "Sitting"], scene: "seated in a softly lit interview set with a dark background, wearing smart business clothes, documentary style" },
  { id: "medical", label: "Clinic", weight: 3, tags: ["Medical", "Office"], scene: "in a bright modern clinic room wearing scrubs, an exam table and cabinets softly blurred behind" },
];

export const TONES = ["Excited", "Enthusiastic", "Happy", "Friendly", "Calm", "Serious", "Curious"] as const;
// target mix: mostly enthusiastic / smiling, a solid serious group, few calm & curious
const TONE_W: Record<string, number> = { Enthusiastic: 35, Friendly: 20, Serious: 15, Excited: 10, Happy: 8, Calm: 7, Curious: 5 };
const GENDER_W: Record<string, number> = { Female: 55, Male: 45 };
// Main buyers of DTC products on TikTok/Reels are ~20-35: lean young (centre ≈ 25).
const AGE_W: Record<string, number> = { "Young Adult": 50, Adult: 37, Senior: 13 };
const TONE_FACE: Record<string, string> = {
  Excited: "bright energetic expression, eyebrows slightly raised",
  Enthusiastic: "warm big smile, lively eyes",
  Happy: "genuine relaxed smile",
  Friendly: "friendly approachable half-smile",
  Calm: "calm soft expression, gentle smile",
  Serious: "focused, trustworthy, neutral expression",
  Curious: "curious, slightly tilted head, interested look",
};

// Target shares for a US/UK audience, with Asians clearly represented (≈ 25%).
const ETHNICITY_W: Record<string, number> = {
  White: 35, Hispanic: 14, Black: 14, "East Asian": 11, "South Asian": 8, "Southeast Asian": 6, "Middle Eastern": 6, "mixed-race": 6,
};
const ETHNICITY = Object.keys(ETHNICITY_W);
const NAMES: Record<Gender, string[]> = {
  Female: ["Emma", "Olivia", "Ava", "Sophia", "Mia", "Chloe", "Grace", "Zoe", "Hannah", "Maya", "Nora", "Ella", "Ruby", "Leah", "Aria", "Ivy", "Sarah", "Megan", "Priya", "Layla", "Camila", "Jade", "Amara", "Sienna", "Daisy", "Linda", "Carol", "Diane", "Mei", "Yuna", "Hana", "Linh", "Ananya"],
  Male: ["Liam", "Noah", "Ethan", "Lucas", "Mason", "Jack", "Owen", "Leo", "Ryan", "Caleb", "Nathan", "Jordan", "Marcus", "Adam", "Theo", "Dylan", "Omar", "Raj", "Diego", "Kai", "Andre", "Sam", "Harry", "George", "Frank", "Gary", "Peter", "Kenji", "Jun", "Minh", "Arjun", "Hiro"],
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
  { age: "Young Adult", min: 21, max: 30 },
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
  const use = { eth: new Map<string, number>(), gender: new Map<string, number>(), age: new Map<string, number>(), place: new Map<string, number>(), tone: new Map<string, number>(), combo: new Map<string, number>() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const a of existing) {
    inc(use.gender, a.gender); inc(use.age, a.age); inc(use.tone, a.emotion);
    const st = SETTINGS.find((x) => x.tags.every((t) => a.situation.includes(t)));
    if (st) inc(use.place, st.id);
  }
  // Quota pick: the option furthest below its target share, i.e. smallest (used + 1) / weight.
  const least = <T,>(opts: T[], key: (x: T) => string, m: Map<string, number>, w: (x: T) => number = () => 1) => {
    const score = (o: T) => ((m.get(key(o)) || 0) + 1) / w(o);
    const min = Math.min(...opts.map(score));
    return pick(opts.filter((o) => Math.abs(score(o) - min) < 1e-9));
  };
  const used = new Set<string>(existing.map((a: any) => a.name));
  let ukCount = 0;
  return Array.from({ length: n }, (_, i) => {
    const gender = least<Gender>(["Female", "Male"], (g) => g, use.gender, (g) => GENDER_W[g]);
    const band = least(AGES, (a) => a.age, use.age, (a) => AGE_W[a.age]);
    // place: least used overall, and avoid repeating the same gender+place combo
    const setting = least(SETTINGS, (x) => x.id, new Map(SETTINGS.map((x) => [x.id, (use.place.get(x.id) || 0) + (use.combo.get(gender + x.id) || 0) * 0.5])), (x) => x.weight);
    const tone = least([...TONES], (t) => t, use.tone, (t) => TONE_W[t]);
    inc(use.gender, gender); inc(use.age, band.age); inc(use.place, setting.id); inc(use.tone, tone); inc(use.combo, gender + setting.id);
    const accent: "american" | "british" = ukCount < Math.round((i + 1) / 3) ? "british" : "american"; // ~1 in 3 UK
    if (accent === "british") ukCount++;
    let name = pick(NAMES[gender]);
    for (let k = 0; k < 20 && used.has(name); k++) name = pick(NAMES[gender]);
    used.add(name);
    const ethnicity = least(ETHNICITY, (e) => e, use.eth, (e) => ETHNICITY_W[e]);
    inc(use.eth, ethnicity);
    // triangular distribution: young adults cluster around 25
    const r = (Math.random() + Math.random()) / 2;
    const years = Math.round(band.min + r * (band.max - band.min));
    const base = { name, gender, age: band.age, years, ethnicity, setting, tone, accent };
    return { ...base, key: Math.random().toString(36).slice(2, 10), prompt: buildPrompt(base) };
  });
}

/** ElevenLabs Voice Library filters for a spec. */
export const voiceQuery = (s: Pick<ActorSpec, "gender" | "age" | "accent">) => ({
  gender: s.gender.toLowerCase(),
  age: s.age === "Young Adult" ? "young" : s.age === "Senior" ? "old" : "middle_aged",
  accent: s.accent,
});
