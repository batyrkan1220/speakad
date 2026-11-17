import type { ModelId } from "./types";

/** Talking-actor video models (all served by fal.ai with the same FAL_KEY). */
export const MODELS: Record<ModelId, { label: string; endpoint: string; pricePerSec: number; resolution: boolean }> = {
  "omnihuman-2": { label: "OmniHuman 2.0", endpoint: "bytedance/omnihuman/v2", pricePerSec: 0.105, resolution: false },
  "omnihuman-1.5": { label: "OmniHuman 1.5", endpoint: "fal-ai/bytedance/omnihuman/v1.5", pricePerSec: 0.16, resolution: true },
  "kling-avatar-v2-pro": { label: "Kling Avatar v2 Pro", endpoint: "fal-ai/kling-video/ai-avatar/v2/pro", pricePerSec: 0.115, resolution: false },
  "omnihuman-1.5-turbo": { label: "OmniHuman 1.5 Turbo", endpoint: "fal-ai/bytedance/omnihuman/v1.5", pricePerSec: 0.16, resolution: true },
  "kling-avatar-v2-standard": { label: "Kling Avatar v2 Standard", endpoint: "fal-ai/kling-video/ai-avatar/v2/standard", pricePerSec: 0.0562, resolution: false },
  "fabric-1.0": { label: "VEED Fabric 1.0", endpoint: "veed/fabric-1.0", pricePerSec: 0.15, resolution: false },
  "heygen-avatar4": { label: "HeyGen Avatar IV", endpoint: "fal-ai/heygen/avatar4/image-to-video", pricePerSec: 0.1, resolution: false },
};

/** Models the admin can compare (clients always get OmniHuman 2.0). */
export const TEST_MODELS: ModelId[] = ["omnihuman-2", "heygen-avatar4", "fabric-1.0", "kling-avatar-v2-pro", "omnihuman-1.5"];

export const modelOf = (id?: string): ModelId => (id && id in MODELS ? (id as ModelId) : "omnihuman-2");

/** OmniHuman 2.0 needs at least 4 s of audio; shorter clips fall back to 1.5. */
export const MIN_AUDIO_SEC: Partial<Record<ModelId, number>> = { "omnihuman-2": 4 };

/** Default direction for UGC realism (OmniHuman 2.0 accepts a scene / motion prompt). */
import { motionPrompt } from "@/lib/motion";

export const UGC_MOTION_OLD =
  "A real person filming a casual selfie video on their phone, talking naturally to the camera with subtle head movements, " +
  "natural blinking, relaxed small hand gestures and slight handheld camera movement. Keep the face, body and background exactly as in the image.";
/** Default motion prompt (no actor details known). */
export const UGC_MOTION = motionPrompt({});

/** fal input for the chosen model. */
export function modelInput(id: ModelId, a: { imageUrl: string; audioUrl: string; resolution: string; prompt?: string }) {
  if (id === "omnihuman-2") {
    return { image_url: a.imageUrl, audio_url: a.audioUrl, prompt: a.prompt || UGC_MOTION };
  }
  if (id === "fabric-1.0") {
    return { image_url: a.imageUrl, audio_url: a.audioUrl, resolution: "720p" };
  }
  if (id === "heygen-avatar4") {
    return { image_url: a.imageUrl, audio_url: a.audioUrl, talking_style: "expressive", aspect_ratio: "9:16", resolution: "720p" };
  }
  if (id.startsWith("kling")) {
    return { image_url: a.imageUrl, audio_url: a.audioUrl, prompt: a.prompt || UGC_MOTION };
  }
  return {
    image_url: a.imageUrl,
    audio_url: a.audioUrl,
    resolution: a.resolution,
    turbo_mode: id === "omnihuman-1.5-turbo",
    ...(a.prompt ? { prompt: a.prompt } : {}),
  };
}
