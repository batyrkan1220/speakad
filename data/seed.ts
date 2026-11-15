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

/**
 * Built-in actors used to live here (Mila, Jess, Mark, Lina). They were removed: the library is now
 * made only of SpeakAd's own AI actors from the Actor Factory (served by /api/library).
 */
export const SEED_ACTORS: Actor[] = [];
