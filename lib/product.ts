export type Placement = "hand" | "closeup" | "table" | "using" | "angle";

export const PLACEMENTS: { id: Placement; label: string; emoji: string; prompt: string }[] = [
  { id: "hand", label: "In hand", emoji: "✋",
    prompt: "The person is naturally holding the product in one hand at chest height, label facing the camera, as if recommending it in a selfie video." },
  { id: "closeup", label: "Show to camera", emoji: "📸",
    prompt: "The person holds the product up close to the camera next to their face so it is large and in sharp focus, label clearly readable." },
  { id: "table", label: "On the table", emoji: "🪑",
    prompt: "The product stands on a table or surface right in front of the person, clearly visible in the lower part of the frame, person sitting behind it." },
  { id: "using", label: "Using it", emoji: "✨",
    prompt: "The person is using the product the way it is meant to be used (applying, drinking, wearing or operating it), product clearly visible." },
  { id: "angle", label: "New angle", emoji: "🎥",
    prompt: "Same person and same setting shot from a slightly different camera angle (three-quarter view), holding the product in hand, still looking at the camera." },
];

export const placementOf = (id?: string) => PLACEMENTS.find((p) => p.id === id) || PLACEMENTS[0];
