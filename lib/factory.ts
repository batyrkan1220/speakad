/** The one line every actor says (voice sample + preview video), recorded with ElevenLabs. */
export const WELCOME_LINE = "Hey! I'm your AI actor on SpeakAd. Give me a script, and I'll turn it into a scroll-stopping ad in minutes.";
/** Language each actor speaks in its preview (Kazakhstan market: Kazakh faces speak Kazakh, local Slavic faces speak Russian). */
export type ActorLang = "en" | "kk" | "ru";
export const WELCOME_LINES: Record<ActorLang, string> = {
  en: WELCOME_LINE,
  kk: "Сәлем! Мен SpeakAd-тағы AI актерыңызбын. Маған сценарий беріңіз, мен оны бірнеше минутта көз тартатын жарнамаға айналдырамын.",
  ru: "Привет! Я ваш AI-актёр на SpeakAd. Дайте мне сценарий, и за пару минут я превращу его в рекламу, от которой не оторваться.",
};
/** Language of an actor: stored on new passports; older Central Asian actors default to Kazakh. */
export function actorLang(p: { lang?: string; ethnicity?: string; accent?: string }): ActorLang {
  if (p.lang === "kk" || p.lang === "ru" || p.lang === "en") return p.lang;
  if (p.accent === "kazakh" || p.ethnicity === "Central Asian") return "kk";
  if (p.accent === "russian") return "ru";
  return "en";
}

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
  { id: "street", label: "Street", weight: 8, tags: ["Outside", "Street"], scene: "standing on a city sidewalk with shop fronts, parked cars and people passing in the background" },
  { id: "walking", label: "Walking", weight: 6, tags: ["Outside", "Walking", "Movement"], scene: "walking on a sunny neighborhood sidewalk, trees and houses behind, slight motion" },
  { id: "backyard", label: "Backyard", weight: 4, tags: ["Outside", "Backyard"], scene: "standing in a sunny suburban backyard with green grass, a wooden fence and patio chairs behind" },
  { id: "nature", label: "Nature", weight: 7, tags: ["Outside", "Nature"], scene: "outdoors on a trail in a green park with trees and soft golden sunlight behind" },
  { id: "balcony", label: "Balcony", weight: 2, tags: ["Outside", "Balcony"], scene: "on an apartment balcony with city buildings and evening golden-hour light behind" },
  { id: "gym", label: "Gym", weight: 4, tags: ["Gym"], scene: "in a gym after a workout, weights and machines blurred in the background, slightly sweaty" },
  { id: "cafe", label: "Coffee shop", weight: 2, tags: ["Coffee Shop", "Sitting"], scene: "sitting at a small table in a warm coffee shop with a latte in front" },
  { id: "podcast", label: "Podcast", weight: 6, tags: ["Podcast", "Studio"], scene: "in a small podcast studio with a microphone on a boom arm in front and acoustic panels behind", accessories: ["Mic"] },
  { id: "interview", label: "Interview", weight: 4, tags: ["Interview", "Studio", "Formal", "Sitting"], scene: "seated in a softly lit interview set with a dark background, wearing smart business clothes, documentary style" },
  { id: "medical", label: "Clinic", weight: 3, tags: ["Medical", "Office"], scene: "in a bright modern clinic room wearing scrubs, an exam table and cabinets softly blurred behind" },
];

/** How the clip is filmed (Arcads mix: mostly a propped camera with both hands free, few true selfies). */
export type ShotId = "tripod-sit" | "tripod-stand" | "dashboard" | "holding" | "desk" | "selfie" | "vlog";
export const SHOTS: Record<ShotId, { framing: string; camera: string }> = {
  "tripod-sit": {
    framing: "The camera is propped on a small tripod at eye level about 1.5 m away (nobody is holding it): framed from just above the head down to the waist, the person sits facing the lens with BOTH hands free and visible, relaxed in front of them, ready to gesture while talking.",
    camera: "Shot on a recent iPhone rear camera on a tripod",
  },
  "tripod-stand": {
    framing: "The camera stands on a tripod at chest height about 2 m away (nobody is holding it): framed from above the head down to the hips or mid-thigh, the person stands facing the lens with BOTH hands free and visible, relaxed, ready to gesture.",
    camera: "Shot on a recent iPhone rear camera on a tripod",
  },
  dashboard: {
    framing: "The phone is mounted on the dashboard / windshield holder (nobody is holding it), slightly below eye level: framed from above the head to the chest, seatbelt on, BOTH hands free — one resting on the steering wheel, the other relaxed.",
    camera: "Shot on a recent iPhone front camera in a dashboard mount",
  },
  holding: {
    framing: "The camera is propped on the table at eye level about 1 m away (nobody is holding it): framed from above the head down to the waist, the person holds {item} with both hands near the chest, relaxed and natural.",
    camera: "Shot on a recent iPhone rear camera propped on a table",
  },
  desk: {
    framing: "The camera sits on the desk at eye level (a webcam-style setup, nobody is holding it): framed from above the head down to the waist, forearms and hands resting on the desk, free to gesture.",
    camera: "Shot on a good webcam / iPhone on a desk stand",
  },
  selfie: {
    framing: "Front-camera selfie at a comfortable arm's length, but the phone and the holding arm are NOT visible in the frame: framed from just above the head to the chest, face about a third of the frame height, setting clearly visible around the person.",
    camera: "Shot on a recent iPhone front camera",
  },
  vlog: {
    framing: "Vlog-style front camera held out in front while walking, the phone and the holding arm NOT visible: framed from above the head to the chest, background slightly moving.",
    camera: "Shot on a recent iPhone front camera",
  },
};
const HOLD_ITEMS = ["a ceramic coffee mug", "a cup of tea", "a glass of water", "a takeaway coffee cup", "a plain notebook"];
/** Shots that make sense in each place, with Arcads-like weights. */
const SHOTS_FOR: Record<string, [ShotId, number][]> = {
  living: [["tripod-sit", 5], ["holding", 3], ["selfie", 2]],
  bedroom: [["tripod-sit", 4], ["holding", 2], ["selfie", 3]],
  kitchen: [["tripod-stand", 5], ["holding", 3], ["selfie", 1]],
  bathroom: [["tripod-stand", 4], ["selfie", 3]],
  office: [["desk", 5], ["holding", 2], ["tripod-sit", 2]],
  car: [["dashboard", 7], ["selfie", 2]],
  street: [["tripod-stand", 4], ["selfie", 3]],
  walking: [["vlog", 1]],
  backyard: [["tripod-stand", 5], ["holding", 1], ["selfie", 2]],
  nature: [["tripod-stand", 4], ["selfie", 3]],
  balcony: [["tripod-stand", 3], ["holding", 2], ["selfie", 2]],
  gym: [["tripod-stand", 5], ["selfie", 2]],
  cafe: [["holding", 5], ["tripod-sit", 2]],
  podcast: [["desk", 1]],
  interview: [["tripod-sit", 1]],
  medical: [["tripod-stand", 3], ["tripod-sit", 3]],
};
export function shotFor(settingId: string): ShotId {
  return wpick(SHOTS_FOR[settingId] || [["tripod-sit", 3], ["selfie", 1]]) as ShotId;
}

export const TONES = ["Excited", "Enthusiastic", "Happy", "Friendly", "Calm", "Serious", "Curious"] as const;
// target mix: mostly enthusiastic / smiling, a solid serious group, few calm & curious
const TONE_W: Record<string, number> = { Enthusiastic: 35, Friendly: 20, Serious: 15, Excited: 10, Happy: 8, Calm: 7, Curious: 5 };
const GENDER_W: Record<string, number> = { Female: 55, Male: 45 };
// Main buyers of DTC products on TikTok/Reels are ~20-35: lean young (centre ≈ 25).
const AGE_W: Record<string, number> = { "Young Adult": 50, Adult: 37, Senior: 13 };
const TONE_FACE: Record<string, string> = {
  Excited: "bright energetic expression, eyebrows slightly raised",
  Enthusiastic: "warm closed-mouth smile, lively eyes",
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
// Kazakhstan / Central Asia market: mostly Kazakh-looking faces, plus the local Slavic and mixed mix.
const ETHNICITY_CA: Record<string, number> = {
  "Central Asian": 60, White: 22, "mixed-race": 8, "East Asian": 6, "Middle Eastern": 4,
};
export type FactoryMarket = "global" | "central-asia";
const ethWeights = (m: FactoryMarket) => (m === "central-asia" ? ETHNICITY_CA : ETHNICITY_W);
/** How the image model should read each look (Central Asian = Kazakh / Kyrgyz / Uzbek faces). */
const ETH_PROMPT: Record<string, string> = {
  "Central Asian": "Kazakh (Central Asian)",
};

/** Names that fit the actor's look, so a Kazakh face is not called "Emma". */
const NAMES_BY_ETH: Record<string, Record<Gender, string[]>> = {
  "Central Asian": {
    Female: ["Aigerim", "Aruzhan", "Dana", "Madina", "Asel", "Kamila", "Dariga", "Zhansaya", "Aizhan", "Saule", "Gulnara", "Aliya", "Togzhan", "Ainur", "Raushan", "Bayan"],
    Male: ["Nurlan", "Daulet", "Arman", "Yerlan", "Aibek", "Timur", "Askar", "Bauyrzhan", "Dias", "Yerzhan", "Serik", "Marat", "Alikhan", "Sanzhar", "Nursultan", "Bolat"],
  },
  "East Asian": {
    Female: ["Mei", "Yuna", "Hana", "Jia", "Sora", "Min-ji", "Lin", "Akiko", "Xiu", "Ji-woo"],
    Male: ["Kenji", "Jun", "Hiro", "Wei", "Min-ho", "Takeshi", "Chen", "Daniel", "Ryu", "Haoran"],
  },
  "Southeast Asian": {
    Female: ["Linh", "Mai", "Angelica", "Siti", "Nadia", "Ploy", "Thao", "Bea"],
    Male: ["Minh", "Paolo", "Rizal", "Anh", "Arif", "Somchai", "Miguel", "Tuan"],
  },
  "South Asian": {
    Female: ["Priya", "Ananya", "Aisha", "Kavya", "Neha", "Riya", "Simran", "Divya"],
    Male: ["Raj", "Arjun", "Rohan", "Vikram", "Imran", "Dev", "Sameer", "Karan"],
  },
  "Middle Eastern": {
    Female: ["Layla", "Yasmin", "Noor", "Sara", "Mariam", "Leila", "Dalia", "Rania"],
    Male: ["Omar", "Karim", "Ali", "Youssef", "Hassan", "Tariq", "Sami", "Amir"],
  },
  Hispanic: {
    Female: ["Camila", "Sofia", "Valentina", "Lucia", "Isabella", "Gabriela", "Daniela", "Elena"],
    Male: ["Diego", "Mateo", "Carlos", "Luis", "Javier", "Andres", "Gabriel", "Santiago"],
  },
  Black: {
    Female: ["Amara", "Jade", "Imani", "Zuri", "Aaliyah", "Nia", "Keisha", "Grace", "Simone"],
    Male: ["Marcus", "Andre", "Jordan", "Malik", "Darius", "Isaiah", "Kwame", "Tyrone", "Elijah"],
  },
};
// White (Central Asia market) = local Russian / Slavic names
const NAMES_SLAVIC: Record<Gender, string[]> = {
  Female: ["Anastasia", "Olga", "Ekaterina", "Natasha", "Irina", "Yulia", "Alina", "Svetlana", "Polina", "Ksenia"],
  Male: ["Dmitry", "Alexei", "Sergei", "Ivan", "Maxim", "Nikita", "Andrei", "Pavel", "Artem", "Roman"],
};
function namesFor(eth: string, g: Gender, market: FactoryMarket) {
  if (market === "central-asia" && eth === "White") return NAMES_SLAVIC[g];
  return NAMES_BY_ETH[eth]?.[g] || NAMES[g];
}
const NAMES: Record<Gender, string[]> = {
  Female: ["Emma", "Olivia", "Ava", "Sophia", "Mia", "Chloe", "Grace", "Zoe", "Hannah", "Maya", "Nora", "Ella", "Ruby", "Leah", "Aria", "Ivy", "Sarah", "Megan", "Priya", "Layla", "Camila", "Jade", "Amara", "Sienna", "Daisy", "Linda", "Carol", "Diane", "Mei", "Yuna", "Hana", "Linh", "Ananya"],
  Male: ["Liam", "Noah", "Ethan", "Lucas", "Mason", "Jack", "Owen", "Leo", "Ryan", "Caleb", "Nathan", "Jordan", "Marcus", "Adam", "Theo", "Dylan", "Omar", "Raj", "Diego", "Kai", "Andre", "Sam", "Harry", "George", "Frank", "Gary", "Peter", "Kenji", "Jun", "Minh", "Arjun", "Hiro"],
};
const AGES: { age: Age; min: number; max: number }[] = [
  { age: "Young Adult", min: 21, max: 30 },
  { age: "Adult", min: 30, max: 48 },
  { age: "Senior", min: 55, max: 70 },
];

// ───────── Look: everything that makes the person read as a real human of that age ─────────

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const wpick = (opts: [string, number][]) => {
  let r = Math.random() * opts.reduce((t, [, w]) => t + w, 0);
  for (const [o, w] of opts) if ((r -= w) <= 0) return o;
  return opts[0][0];
};

/** Skin / face changes that come with age (the main tell of fake "AI faces" is ageless skin). */
export function ageLook(years: number) {
  // Real but camera-friendly: age shows gently, skin stays healthy and clear (UGC actors, not documentary portraits).
  if (years <= 24) return "fresh, healthy, clear skin with natural texture";
  if (years <= 30) return "healthy clear skin with natural texture, the faintest lines at the eyes when smiling";
  if (years <= 38) return "healthy, well-cared-for skin with subtle fine lines at the eyes when smiling";
  if (years <= 48) return "well-kept middle-aged face: soft smile lines and light crow's feet, healthy even skin, maybe a few grey hairs";
  if (years <= 62) return "well-kept mature face: natural soft wrinkles and smile lines, healthy skin, neat greying hair";
  return "graceful older face: soft natural wrinkles, healthy skin, neat grey or white hair";
}

/** Hair that fits ethnicity, sex and age. */
function hairFor(eth: string, g: Gender, years: number) {
  const grey = years >= 55 ? (chance(0.6) ? "grey " : "salt-and-pepper ") : years >= 42 && chance(0.4) ? "slightly greying " : "";
  const F: Record<string, string[]> = {
    Black: ["shoulder-length box braids", "natural coily hair in a puff", "short tapered natural hair", "long locs tied back", "a silk-pressed bob"],
    "East Asian": ["long straight black hair", "a shoulder-length black bob with bangs", "straight dark brown hair tucked behind the ears"],
    "Central Asian": ["long straight black hair", "dark brown hair in a low ponytail", "shoulder-length straight dark hair", "a sleek black bun", "long dark hair with subtle brown highlights"],
    "Southeast Asian": ["long straight black hair", "wavy dark brown hair in a low ponytail", "a short black bob"],
    "South Asian": ["long thick dark brown hair", "dark hair in a loose braid", "wavy black hair past the shoulders"],
    default: ["long wavy brown hair", "straight blonde hair in a sleek ponytail", "curly dark hair", "a short bob", "a neat bun", "shoulder-length auburn hair", "honey-blonde hair"],
  };
  const M: Record<string, string[]> = {
    Black: ["a short fade", "a buzz cut", "short twists", "a low-cut with a lined-up hairline"],
    "East Asian": ["short straight black hair", "a textured black crop", "black hair parted to the side"],
    "Central Asian": ["short straight black hair", "a short black fade", "dark hair neatly side-parted", "a short textured black crop"],
    "Southeast Asian": ["short black hair", "a black undercut", "neatly styled black hair"],
    "South Asian": ["short thick black hair", "wavy dark hair swept back", "a neat side part"],
    default: ["short brown hair", "a buzz cut", "curly hair", "a short fade", "neatly styled hair", "swept-back hair"],
  };
  const pool = (g === "Female" ? F : M);
  let h = pick(pool[eth] || pool.default);
  if (g === "Male" && years >= 38 && chance(0.4)) h = "a receding hairline with " + h.replace(/^a /, "");
  if (years >= 62 && g === "Male" && chance(0.3)) h = "a mostly bald head with short grey hair on the sides";
  return grey + h;
}

function facialHair(g: Gender, years: number) {
  if (g !== "Male") return "";
  return wpick([["clean-shaven", 3], ["light stubble", 3], ["a short trimmed beard", 2], ["a full beard", years > 25 ? 1.5 : 0.5], ["a moustache", years > 45 ? 1 : 0.2]]);
}

function bodyFor(g: Gender, years: number) {
  const young = years < 35;
  const F: [string, number][] = [["slim", young ? 3 : 2], ["average build", 4], ["curvy", 2.5], ["athletic", young ? 2 : 1], ["plus-size", 2], ["petite", 1.5], ["soft, slightly heavier build", years > 40 ? 2 : 0.5]];
  const M: [string, number][] = [["slim", young ? 2.5 : 1], ["average build", 4], ["athletic", young ? 2.5 : 1.5], ["broad-shouldered and stocky", 2], ["heavyset", 1.5], ["a bit of a belly (dad bod)", years > 32 ? 3 : 0.5], ["lean and wiry", 1]];
  return wpick(g === "Female" ? F : M);
}

/** 0–3 individual marks so no two actors look like the same generated face. */
function featuresFor(g: Gender, years: number, eth: string) {
  // Light, flattering details only — no scars, acne or skin damage (actors must look like people brands would cast).
  const all: [string, number][] = [
    ["a few light freckles across the nose", eth === "White" || eth === "mixed-race" ? 1.2 : 0.1],
    ["a tiny beauty mark on one cheek", 0.6],
    ["stylish everyday glasses", years > 40 ? 1.4 : 0.8],
    ["a dimple when smiling", 0.8],
    ["neatly groomed eyebrows", 1],
    ["small stud earrings", g === "Female" ? 1 : 0.1],
    ["a thin simple necklace", g === "Female" ? 0.8 : 0.2],
    ["a classic wristwatch", 0.6],
    ["laugh lines that show when smiling", years > 35 ? 0.8 : 0],
  ];
  const n = wpick([["0", 2], ["1", 3], ["2", 1.5]]);
  const out: string[] = [];
  for (let i = 0; i < Number(n); i++) {
    const f = wpick(all.filter(([x]) => !out.includes(x)));
    if (f) out.push(f);
  }
  return out;
}

function makeupFor(g: Gender, years: number) {
  if (g !== "Female") return "";
  return wpick([["no makeup", 3], ["light everyday makeup", 4], ["a little mascara and lip balm", 2], ["fresh natural makeup", 2]]);
}

const OUTFIT: Record<Gender, string[]> = {
  Female: ["an oversized cream hoodie", "a plain white t-shirt", "a beige knit sweater", "a casual denim jacket", "a black tank top", "a sage green sweatshirt", "a linen button-up shirt", "a grey crewneck with a small stain", "a cozy cardigan over a tee"],
  Male: ["a grey hoodie", "a plain black t-shirt", "a navy crewneck sweater", "a flannel shirt", "a white oxford shirt", "an olive overshirt", "a zip-up track jacket", "a faded plain grey t-shirt", "a polo shirt"],
};

export interface ActorSpec {
  key: string; name: string; gender: Gender; age: Age; years: number; ethnicity: string;
  setting: Setting; tone: string; accent: "american" | "british" | "kazakh" | "russian"; lang?: ActorLang;
  hair: string; facialHair: string; body: string; features: string[]; makeup: string; outfit: string;
  shot?: ShotId; item?: string;
  prompt: string;
}

/** Fill in the physical look (kept on the spec so regenerating a photo keeps the same person). */
export function withLook<T extends { gender: Gender; years: number; ethnicity: string }>(b: T) {
  return {
    ...b,
    hair: hairFor(b.ethnicity, b.gender, b.years),
    facialHair: facialHair(b.gender, b.years),
    body: bodyFor(b.gender, b.years),
    features: featuresFor(b.gender, b.years, b.ethnicity),
    makeup: makeupFor(b.gender, b.years),
    outfit: b.gender === "Female" && b.years >= 55 ? pick(["a soft cardigan", "a knit sweater", "a floral blouse"]) : pick(OUTFIT[b.gender]),
  };
}

function shotFraming(s: { shot?: ShotId; item?: string }) {
  return SHOTS[s.shot || "selfie"].framing.replace("{item}", s.item || "a ceramic coffee mug");
}

export function buildPrompt(s: Omit<ActorSpec, "prompt" | "key">) {
  const who = s.gender === "Female" ? "woman" : "man";
  const extras = [s.facialHair, s.makeup, ...s.features].filter(Boolean).join(", ");
  return [
    // what it is
    "A real smartphone video frame (vertical 9:16) of a likeable, good-looking UGC creator recording a TikTok / Instagram ad — the kind of friendly, camera-ready everyday person brands cast for ads: well-groomed, neat hair, clean tidy clothes, healthy glow. Real and natural, not a glossy fashion photoshoot.",
    // who
    `Subject: a ${s.years}-year-old ${ETH_PROMPT[s.ethnicity] || s.ethnicity} ${who}, ${s.body}, with ${s.hair}${extras ? `, ${extras}` : ""}, wearing ${s.outfit}.`,
    // age realism
    `Face true to age ${s.years}: ${ageLook(s.years)}. Skin is clear and healthy with natural fine texture (not plastic, not airbrushed); body proportions true to a ${s.body} person.`,
    // where
    `Setting: ${s.setting.scene}${s.setting.tags.includes("Home") ? ", lived-in but tidy, with a few everyday objects" : ""}.`,
    // pose & expression (closed mouth = clean lip-sync later)
    `Expression: ${TONE_FACE[s.tone] || "natural expression"} with the lips closed (no teeth showing), looking straight into the lens.`,
    // framing + camera: Arcads-style mix (mostly a propped camera, both hands free)
    shotFraming(s),
    `${SHOTS[s.shot || "selfie"].camera}: soft flattering daylight on the face, natural colours, sharp focus on the eyes, composition a little off-centre.`,
    // what to avoid
    "Avoid: scars, acne, pimples, blemishes, rashes, wounds, bruises, skin damage, heavy wrinkles for the age, tired or unkempt look, messy greasy hair, dark eye bags, airbrushed or plastic skin, beauty filters, perfect symmetry, glowing studio lighting, HDR, bokeh portrait mode, CGI or 3D render look, showing teeth, extreme close-ups or cropped heads, a phone or selfie stick visible in the hand, an arm stretched out towards the camera, mirror selfies, extra fingers, any text, brand names, band or sports logos or graphic prints on clothing, watermarks.",
  ].join(" ");
}

/**
 * Only the number of actors is given; everything else is balanced automatically.
 * Each new actor takes the least-used gender, age, place and tone, counting the
 * existing library plus the actors already planned in this batch (ties broken randomly).
 */
export function makeSpecs(n: number, existing: { gender: string; age: string; situation: string[]; emotion: string; ethnicity?: string }[] = [], market: FactoryMarket = "global"): ActorSpec[] {
  const ETH_W = ethWeights(market);
  const ETH = Object.keys(ETH_W);
  const use = { eth: new Map<string, number>(), gender: new Map<string, number>(), age: new Map<string, number>(), place: new Map<string, number>(), tone: new Map<string, number>(), combo: new Map<string, number>() };
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  for (const a of existing) {
    inc(use.gender, a.gender); inc(use.age, a.age); inc(use.tone, a.emotion);
    if (a.ethnicity) inc(use.eth, a.ethnicity);
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
    let accent: ActorSpec["accent"] = ukCount < Math.round((i + 1) / 3) ? "british" : "american"; // ~1 in 3 UK
    if (accent === "british") ukCount++;
    const ethnicity = least(ETH, (e) => e, use.eth, (e) => ETH_W[e]);
    inc(use.eth, ethnicity);
    const pool = namesFor(ethnicity, gender, market);
    let name = pick(pool);
    for (let k = 0; k < 20 && used.has(name); k++) name = pick(pool);
    used.add(name);
    // triangular distribution: young adults cluster around 25
    const r = (Math.random() + Math.random()) / 2;
    const years = Math.round(band.min + r * (band.max - band.min));
    const shot = shotFor(setting.id);
    // Kazakhstan market: Kazakh faces speak Kazakh, local Slavic faces Russian, the rest English
    let lang: ActorLang = "en";
    if (market === "central-asia") {
      if (ethnicity === "White") { lang = "ru"; accent = "russian"; }
      else if (ethnicity === "Central Asian" || ethnicity === "mixed-race") { lang = "kk"; accent = "kazakh"; }
    }
    const base = { ...withLook({ name, gender, age: band.age, years, ethnicity, setting, tone, accent }), lang, shot, item: shot === "holding" ? pick(HOLD_ITEMS) : undefined };
    return { ...base, key: Math.random().toString(36).slice(2, 10), prompt: buildPrompt(base) };
  });
}

const TONE_VOICE: Record<string, string> = {
  Excited: "high-energy, upbeat and fast, genuinely excited",
  Enthusiastic: "warm, upbeat and enthusiastic, smiling while talking",
  Happy: "cheerful and light, relaxed smile in the voice",
  Friendly: "friendly, easygoing and approachable",
  Calm: "calm, soft and reassuring, unhurried",
  Serious: "serious, trustworthy and matter-of-fact",
  Curious: "curious and conversational, slightly playful",
};

/** ElevenLabs Voice Design prompt built from the actor's passport. */
export function voiceDescription(s: { gender: string; years: number; ethnicity: string; accent: string; tone: string; lang?: string }) {
  const who = s.gender === "Female" ? "woman" : "man";
  const lang = actorLang(s as any);
  const accent = lang === "kk" ? "a natural native Kazakh accent from Almaty, speaking fluent everyday Kazakh"
    : lang === "ru" ? "a natural native Russian accent from Kazakhstan, speaking fluent everyday Russian"
    : s.accent === "british" ? "a natural British (London) accent" : "a natural General American accent";
  const pace = s.years >= 55 ? "a slightly slower, mature pace" : "a natural, fairly quick conversational pace";
  return `A ${s.years}-year-old ${s.ethnicity} ${who} with ${accent}. ${TONE_VOICE[s.tone] || "Natural and friendly"}, speaking at ${pace}. ` +
    `Sounds like a real everyday person filming a casual TikTok / Instagram video on their phone in a quiet room: authentic, conversational, ` +
    `close to the mic, not a radio announcer, not a narrator, no studio polish. Perfect audio quality.`;
}

/** ElevenLabs Voice Library filters for a spec. */
export const voiceQuery = (s: Pick<ActorSpec, "gender" | "age" | "accent">) => ({
  gender: s.gender.toLowerCase(),
  age: s.age === "Young Adult" ? "young" : s.age === "Senior" ? "old" : "middle_aged",
  accent: s.accent,
});
