import type { Actor } from "@/lib/types";

// Default ElevenLabs "premade" voices (available on every account).
export const V = {
  rachel: "21m00Tcm4TlvDq8ikWAM",
  sarah: "EXAVITQu4vr4xnSDxMaL",
  charlotte: "XB0fDUnXU5powFXDhCwa",
  lily: "pFZP5JQG7iQjIQuC4Bku",
  domi: "AZnzlk1XvdvUeBnXmlld",
  adam: "pNInz6obpgDQGcFmaJgB",
  josh: "TxGEqnHWrfWFTfGW9XjX",
  george: "JBFqnCBsd6RMkjVDRZzb",
  brian: "nPczCjzI2devNBz1zQrb",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  bill: "pqHfZKP75CyOlISOVTwy",
};

const UGC =
  "vertical 9:16 smartphone selfie video frame, UGC style, natural lighting, looking directly at camera, mouth slightly open as if talking, photorealistic, candid, upper body visible";

type Seed = Omit<Actor, "image" | "prompt"> & { scene: string };

const seeds: Seed[] = [
  { id: "ava", name: "Ava", gender: "Female", age: "Young Adult", situation: ["Car"], accessories: ["Phone"], emotion: "Excited", voiceId: V.sarah, hd: true, scene: "young woman in her 20s with long brown hair sitting in the driver's seat of a car, seatbelt on" },
  { id: "maya", name: "Maya", gender: "Female", age: "Young Adult", situation: ["Bathroom", "GRWM"], accessories: ["Mirror"], emotion: "Happy", voiceId: V.lily, hd: true, scene: "young woman doing get-ready-with-me in a bright bathroom, hair in a claw clip, skincare on the counter" },
  { id: "chloe", name: "Chloe", gender: "Female", age: "Adult", situation: ["Kitchen", "Cooking"], accessories: ["Mug"], emotion: "Smiling", voiceId: V.rachel, hd: true, scene: "woman in her 30s in a cozy modern kitchen holding a coffee mug" },
  { id: "nina", name: "Nina", gender: "Female", age: "Young Adult", situation: ["Gym"], accessories: ["Dumbbells"], emotion: "Enthusiastic", voiceId: V.domi, hd: true, isNew: true, scene: "fit young woman in athletic wear in a gym, light sweat, dumbbells rack behind" },
  { id: "grace", name: "Grace", gender: "Female", age: "Senior", situation: ["Home", "Sitting"], accessories: ["Glasses", "Book"], emotion: "Calm", voiceId: V.charlotte, hd: true, scene: "warm grandmother in her 60s with grey hair and reading glasses sitting on a living room sofa" },
  { id: "zoe", name: "Zoe", gender: "Female", age: "Young Adult", situation: ["Coffee Shop"], accessories: ["Laptop"], emotion: "Happy", voiceId: V.sarah, hd: true, scene: "young woman with curly hair in a coffee shop, laptop on the table" },
  { id: "lauren", name: "Lauren", gender: "Female", age: "Adult", situation: ["Office", "Formal"], accessories: ["Suit"], emotion: "Serious", voiceId: V.rachel, hd: true, scene: "professional woman in her 40s wearing a blazer in a modern office" },
  { id: "amira", name: "Amira", gender: "Female", age: "Adult", situation: ["Home"], accessories: ["Hijab"], emotion: "Smiling", voiceId: V.charlotte, hd: true, isNew: true, scene: "woman in her 30s wearing an elegant hijab in a bright living room" },
  { id: "ella", name: "Ella", gender: "Female", age: "Young Adult", situation: ["Outside", "Walking", "Street"], accessories: ["Bags"], emotion: "Excited", voiceId: V.lily, hd: true, scene: "young woman walking on a city street holding shopping bags, golden hour" },
  { id: "sofia", name: "Sofia", gender: "Female", age: "Adult", situation: ["Podcast", "Studio"], accessories: ["Mic", "Headphone"], emotion: "Calm", voiceId: V.sarah, hd: true, scene: "woman in her 30s in a podcast studio with a microphone and headphones around neck" },
  { id: "jake", name: "Jake", gender: "Male", age: "Young Adult", situation: ["Car"], accessories: ["Phone"], emotion: "Excited", voiceId: V.josh, hd: true, scene: "young man in his 20s with a short beard sitting in a parked car" },
  { id: "marcus", name: "Marcus", gender: "Male", age: "Adult", situation: ["Gym"], accessories: ["Dumbbells"], emotion: "Enthusiastic", voiceId: V.adam, hd: true, scene: "muscular man in his 30s in a gym wearing a tank top" },
  { id: "thomas", name: "Thomas", gender: "Male", age: "Adult", situation: ["Office", "Formal"], accessories: ["Suit"], emotion: "Serious", voiceId: V.brian, hd: true, scene: "man in his 40s in a suit in a glass-walled office" },
  { id: "liam", name: "Liam", gender: "Male", age: "Young Adult", situation: ["Gaming", "Streaming"], accessories: ["Headphone"], emotion: "Happy", voiceId: V.josh, hd: true, isNew: true, scene: "young man at a gaming setup with RGB lights and headphones" },
  { id: "raymond", name: "Raymond", gender: "Male", age: "Senior", situation: ["Home", "Sitting"], accessories: ["Glasses"], emotion: "Calm", voiceId: V.bill, hd: true, scene: "friendly grandfather in his 70s with white hair sitting in an armchair at home" },
  { id: "daniel", name: "Daniel", gender: "Male", age: "Adult", situation: ["Kitchen", "Cooking"], accessories: ["Food"], emotion: "Smiling", voiceId: V.daniel, hd: true, scene: "man in his 30s cooking in a home kitchen, apron on" },
  { id: "omar", name: "Omar", gender: "Male", age: "Adult", situation: ["Outside", "Nature"], accessories: [], emotion: "Happy", voiceId: V.george, hd: true, scene: "man in his 30s outdoors in a park, trees behind him" },
  { id: "ethan", name: "Ethan", gender: "Male", age: "Young Adult", situation: ["Bathroom"], accessories: ["Mirror"], emotion: "Frustrated", voiceId: V.adam, hd: true, scene: "young man in a bathroom mirror selfie, morning routine, slightly tired" },
  { id: "victor", name: "Victor", gender: "Male", age: "Adult", situation: ["Podcast", "Interview"], accessories: ["Mic"], emotion: "Serious", voiceId: V.george, hd: true, scene: "man in his 40s on a podcast set speaking into a studio microphone" },
  { id: "dr-helen", name: "Dr. Helen", gender: "Female", age: "Adult", situation: ["Medical"], accessories: [], emotion: "Calm", voiceId: V.charlotte, hd: true, scene: "female doctor in her 40s wearing a white coat and stethoscope in a clinic" },
  { id: "anna", name: "Anna", gender: "Female", age: "Young Adult", situation: ["Bed", "Home", "Night"], accessories: ["Phone"], emotion: "Sad", voiceId: V.lily, hd: true, scene: "young woman lying in bed at night, lit by a warm lamp" },
  { id: "noah", name: "Noah", gender: "Male", age: "Young Adult", situation: ["Store", "Mall"], accessories: ["Bags"], emotion: "Excited", voiceId: V.josh, hd: true, scene: "young man inside a retail store holding a product box" },
  { id: "news-kate", name: "Kate", gender: "Female", age: "Adult", situation: ["News Anchor", "Studio"], accessories: ["Suit"], emotion: "Serious", voiceId: V.rachel, hd: true, scene: "news anchor woman in a TV studio behind a desk, broadcast lighting" },
  { id: "green-max", name: "Max", gender: "Male", age: "Adult", situation: ["Green Screen"], accessories: [], emotion: "Smiling", voiceId: V.brian, hd: true, scene: "man in his 30s in front of a solid green screen background, plain t-shirt" },
];

export const SEED_ACTORS: Actor[] = seeds.map(({ scene, ...a }) => ({
  ...a,
  prompt: `${scene}, ${UGC}`,
  image: "", // generated on first run ("Generate actor library") or drop a file in /public/actors
}));
