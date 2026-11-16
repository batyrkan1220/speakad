/**
 * Automatic locations: the admin only types a number. Like the actor factory, the system balances
 * the kind of place (home / car / outside / work), never repeats a place it already has, and when
 * every place of a kind exists it makes a new variant (other time of day / style).
 */

export type LocMarket = "global" | "central-asia";
type Kind = "Home" | "Car" | "Outside" | "Work";

interface Place { name: string; kind: Kind; tags: string[]; scene: string; market?: LocMarket }

// share of each kind in the library (UGC ads are mostly filmed at home and in the car)
const KIND_W: Record<Kind, number> = { Home: 40, Car: 14, Outside: 24, Work: 22 };

const PLACES: Place[] = [
  // ── Home ──
  { kind: "Home", name: "Cozy living room", tags: ["Home", "Living Room", "Sitting"], scene: "a cozy lived-in living room with a fabric couch, cushions, a floor lamp and plants" },
  { kind: "Home", name: "Modern apartment", tags: ["Home", "Living Room"], scene: "a bright modern apartment living room with large windows, light wood floor and minimal furniture" },
  { kind: "Home", name: "Bedroom", tags: ["Home", "Bedroom", "Sitting"], scene: "a cozy bedroom with an unmade bed, soft morning light from the window and a bedside lamp" },
  { kind: "Home", name: "Home kitchen", tags: ["Home", "Kitchen"], scene: "a modern home kitchen counter with cups, a kettle and a fruit bowl, cabinets behind" },
  { kind: "Home", name: "Bathroom vanity", tags: ["Home", "Bathroom"], scene: "a clean bright bathroom vanity with a mirror and skincare products on the shelf" },
  { kind: "Home", name: "Home office", tags: ["Home", "Office", "Sitting"], scene: "a home office desk with a laptop, a desk lamp and a bookshelf behind" },
  { kind: "Home", name: "Dining table", tags: ["Home", "Sitting"], scene: "a family dining table by a window with a tablecloth, plates and a vase" },
  { kind: "Home", name: "Hallway mirror", tags: ["Home"], scene: "an apartment entrance hallway with a coat rack, shoes and a tall mirror" },
  { kind: "Home", name: "Kids room", tags: ["Home"], scene: "a tidy children's room with toys on shelves and colourful bedding" },
  { kind: "Home", name: "Kazakh apartment", tags: ["Home", "Living Room", "Sitting"], scene: "a Kazakh family apartment living room with a patterned carpet on the wall, a low table and a soft sofa", market: "central-asia" },
  { kind: "Home", name: "Dastarkhan kitchen", tags: ["Home", "Kitchen", "Sitting"], scene: "a Kazakh home kitchen with a table set with tea in bowls, baursaks and sweets, a samovar or kettle", market: "central-asia" },
  // ── Car ──
  { kind: "Car", name: "Car · daytime", tags: ["Car", "Sitting"], scene: "the driver's seat of a parked car, seatbelt on, daylight through the windows" },
  { kind: "Car", name: "Car · night city", tags: ["Car", "Sitting"], scene: "the driver's seat of a parked car at night with blurry city lights through the windows" },
  { kind: "Car", name: "Car · parking lot", tags: ["Car", "Sitting"], scene: "the front seat of a car parked at a supermarket parking lot, shopping bags on the passenger seat" },
  { kind: "Car", name: "Car · back seat", tags: ["Car", "Sitting"], scene: "the back seat of a taxi or car with the window and street behind" },
  // ── Outside ──
  { kind: "Outside", name: "City street", tags: ["Outside", "Street"], scene: "a city sidewalk with shop fronts, parked cars and people far in the background" },
  { kind: "Outside", name: "Park walk", tags: ["Outside", "Walking", "Nature"], scene: "a green park path with trees and soft golden sunlight" },
  { kind: "Outside", name: "Backyard", tags: ["Outside", "Backyard"], scene: "a sunny backyard with grass, a wooden fence and patio chairs" },
  { kind: "Outside", name: "Balcony", tags: ["Outside", "Balcony"], scene: "an apartment balcony with city buildings and golden-hour light" },
  { kind: "Outside", name: "Beach", tags: ["Outside", "Nature"], scene: "a sandy beach with the sea and a calm sky" },
  { kind: "Outside", name: "Snowy street", tags: ["Outside", "Street"], scene: "a snowy winter city street with bare trees and soft overcast light" },
  { kind: "Outside", name: "Mountains", tags: ["Outside", "Nature"], scene: "a mountain viewpoint with green slopes and snowy peaks in the distance" },
  { kind: "Outside", name: "Almaty street", tags: ["Outside", "Street"], scene: "a tree-lined Almaty street with the Zailiysky Alatau mountains visible far behind", market: "central-asia" },
  { kind: "Outside", name: "Astana skyline", tags: ["Outside", "Street"], scene: "an Astana embankment with modern glass buildings in the background", market: "central-asia" },
  { kind: "Outside", name: "Steppe", tags: ["Outside", "Nature"], scene: "the open Kazakh steppe with golden grass and a wide sky", market: "central-asia" },
  // ── Work / public ──
  { kind: "Work", name: "Coffee shop", tags: ["Coffee Shop", "Sitting"], scene: "a small table in a warm coffee shop with a latte, the counter softly blurred behind" },
  { kind: "Work", name: "Gym", tags: ["Gym"], scene: "a gym with weights and machines softly blurred behind" },
  { kind: "Work", name: "Office", tags: ["Office", "Sitting"], scene: "a modern open-space office with desks, monitors and plants" },
  { kind: "Work", name: "Podcast studio", tags: ["Podcast", "Studio"], scene: "a small podcast studio with a microphone on a boom arm and acoustic panels" },
  { kind: "Work", name: "Clinic", tags: ["Medical", "Office"], scene: "a bright modern clinic room with an exam table and cabinets" },
  { kind: "Work", name: "Beauty salon", tags: ["Studio"], scene: "a beauty salon with a mirror station, ring light and cosmetics" },
  { kind: "Work", name: "Small shop", tags: ["Store"], scene: "a small retail shop with shelves of products and a counter" },
  { kind: "Work", name: "Restaurant", tags: ["Sitting"], scene: "a cozy restaurant table with warm lights and other tables blurred behind" },
  { kind: "Work", name: "Warehouse", tags: ["Office"], scene: "a small business warehouse with cardboard boxes on shelves and packing tape" },
  { kind: "Work", name: "Classroom", tags: ["Office"], scene: "a classroom or training room with a whiteboard and desks" },
];

const VARIANTS = [
  ["morning", "in soft morning light"],
  ["evening", "in warm evening lamp light"],
  ["rainy day", "on a grey rainy day, raindrops on the window"],
  ["minimal", "with a cleaner, more minimal style"],
  ["busy", "a little messier and more lived-in"],
] as const;

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

export interface LocSpec { name: string; scene: string; tags: string[] }

export function makeLocationSpecs(n: number, existingNames: string[], market: LocMarket = "global"): LocSpec[] {
  const pool = PLACES.filter((p) => !p.market || p.market === market);
  const used = new Set(existingNames.map((s) => s.toLowerCase()));
  const kindUse = new Map<Kind, number>();
  for (const name of existingNames) {
    const p = PLACES.find((x) => name.toLowerCase().startsWith(x.name.toLowerCase()));
    if (p) kindUse.set(p.kind, (kindUse.get(p.kind) || 0) + 1);
  }
  const out: LocSpec[] = [];
  for (let i = 0; i < n; i++) {
    // kind furthest below its share
    const kinds = (Object.keys(KIND_W) as Kind[]).filter((k) => pool.some((p) => p.kind === k));
    const score = (k: Kind) => ((kindUse.get(k) || 0) + 1) / KIND_W[k];
    const min = Math.min(...kinds.map(score));
    const kind = pick(kinds.filter((k) => Math.abs(score(k) - min) < 1e-9));
    kindUse.set(kind, (kindUse.get(kind) || 0) + 1);
    const ofKind = pool.filter((p) => p.kind === kind);
    // a place we don't have yet (local places first for the Central Asia market), else a new variant
    const fresh = ofKind.filter((p) => !used.has(p.name.toLowerCase()));
    const local = fresh.filter((p) => p.market === market && market !== "global");
    let spec: LocSpec | null = null;
    if (fresh.length) {
      const p = pick(local.length ? local : fresh);
      spec = { name: p.name, scene: p.scene, tags: p.tags };
    } else {
      for (let k = 0; k < 30 && !spec; k++) {
        const p = pick(ofKind); const [label, how] = pick(VARIANTS);
        const name = `${p.name} · ${label}`;
        if (!used.has(name.toLowerCase())) spec = { name, scene: `${p.scene}, ${how}`, tags: p.tags };
      }
      if (!spec) { const p = pick(ofKind); spec = { name: `${p.name} · ${out.length + 1}`, scene: p.scene, tags: p.tags }; }
    }
    used.add(spec.name.toLowerCase());
    out.push(spec);
  }
  return out;
}
