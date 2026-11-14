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

const MEDIA = "https://mvcrwtlrxqxmkqlbivfh.supabase.co/storage/v1/object/public/media";

/**
 * Real actors (filmed with consent). Portrait = a frame from their clip, preview = the clip,
 * sourceAudio = their own voice, kept for voice cloning once the ElevenLabs plan allows it.
 * Until then each actor uses the closest premade ElevenLabs voice.
 */
export const SEED_ACTORS: Actor[] = [
  {
    id: "mila", name: "Mila", gender: "Female", age: "Adult",
    situation: ["Home", "Living Room"], accessories: [], emotion: "Excited", hd: true, isNew: true,
    voiceId: V.sarah,
    image: `${MEDIA}/images/2026-11-14/b2568913-59da-45d2-a789-a9caab667d74.jpg`,
    video: `${MEDIA}/videos/2026-11-14/846702ca-1e3c-4c01-8e62-ae80ebd8bddc.mp4`,
    sourceAudio: `${MEDIA}/audio/2026-11-14/ba9a174c-ded8-4d27-9113-4c23d435e4d2.mp3`,
  },
  {
    id: "jess", name: "Jess", gender: "Female", age: "Young Adult",
    situation: ["Home", "Bedroom"], accessories: ["Headphone"], emotion: "Enthusiastic", hd: true, isNew: true,
    voiceId: V.lily,
    image: `${MEDIA}/images/2026-11-14/08863404-0ca1-46cf-8249-a0aa6a04dbf1.jpg`,
    video: `${MEDIA}/videos/2026-11-14/8a275517-250d-403b-961f-70b3c7255a3b.mp4`,
    sourceAudio: `${MEDIA}/audio/2026-11-14/26c44a0b-74c4-4178-83d1-9556e4b48323.mp3`,
  },
  {
    id: "mark", name: "Mark", gender: "Male", age: "Adult",
    situation: ["Outside", "Street"], accessories: [], emotion: "Excited", hd: true, isNew: true,
    voiceId: V.brian,
    image: `${MEDIA}/images/2026-11-14/b023f4dc-6561-4adb-b5fa-f372891b7789.jpg`,
    video: `${MEDIA}/videos/2026-11-14/870c6a4a-1fab-4b4c-b36a-ec02c045574f.mp4`,
    sourceAudio: `${MEDIA}/audio/2026-11-14/c7d95186-5089-4053-b9ad-9504171e472b.mp3`,
  },
  {
    id: "lina", name: "Lina", gender: "Female", age: "Young Adult",
    situation: ["Home", "Living Room", "Kitchen"], accessories: ["Jewelry"], emotion: "Calm", hd: true, isNew: true,
    voiceId: V.rachel,
    image: `${MEDIA}/images/2026-11-14/e3eadfd7-7dfa-4098-892d-af33e4fc65fd.jpg`,
    video: `${MEDIA}/videos/2026-11-14/ca0e777a-b328-4d40-8349-0e3ec42e2dbd.mp4`,
    sourceAudio: `${MEDIA}/audio/2026-11-14/149788f9-f9d0-4d1a-b340-2069b807620f.mp3`,
  },
];
