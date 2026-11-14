import type { ModelId } from "./types";

/** Talking-actor video models (all served by fal.ai with the same FAL_KEY). */
export const MODELS: Record<ModelId, { label: string; endpoint: string; pricePerSec: number; resolution: boolean }> = {
  "omnihuman-1.5": { label: "OmniHuman 1.5", endpoint: "fal-ai/bytedance/omnihuman/v1.5", pricePerSec: 0.16, resolution: true },
  "omnihuman-1.5-turbo": { label: "OmniHuman 1.5 Turbo", endpoint: "fal-ai/bytedance/omnihuman/v1.5", pricePerSec: 0.16, resolution: true },
  "kling-avatar-v2-pro": { label: "Kling Avatar v2 Pro", endpoint: "fal-ai/kling-video/ai-avatar/v2/pro", pricePerSec: 0.115, resolution: false },
  "kling-avatar-v2-standard": { label: "Kling Avatar v2 Standard", endpoint: "fal-ai/kling-video/ai-avatar/v2/standard", pricePerSec: 0.0562, resolution: false },
};

export const modelOf = (id?: string): ModelId => (id && id in MODELS ? (id as ModelId) : "omnihuman-1.5");

/** fal input for the chosen model. */
export function modelInput(id: ModelId, a: { imageUrl: string; audioUrl: string; resolution: string; prompt?: string }) {
  if (id.startsWith("kling")) {
    return { image_url: a.imageUrl, audio_url: a.audioUrl, ...(a.prompt ? { prompt: a.prompt } : {}) };
  }
  return {
    image_url: a.imageUrl,
    audio_url: a.audioUrl,
    resolution: a.resolution,
    turbo_mode: id === "omnihuman-1.5-turbo",
    ...(a.prompt ? { prompt: a.prompt } : {}),
  };
}
