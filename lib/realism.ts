/**
 * Shared "looks like a real person on a phone video" rules, used by every image and video prompt
 * (portraits, new looks, places, product scenes, talking-video motion) so they stay consistent.
 */

/** Image: how the frame should look. */
export const REAL_FRAME =
  "It must look like a frame grabbed from a real person's phone video: natural available light, true-to-life colours, " +
  "slight phone-camera grain and mild compression, focus on the eyes, composition a little off-centre — not a professional photo, " +
  "not a stock photo, not a corporate headshot, not an advert render.";

/** Image: real human skin & face (clean, but not airbrushed). */
export const REAL_SKIN =
  "Real human skin with visible natural pores, fine texture and tiny natural unevenness in tone, a slightly asymmetric face, " +
  "a few loose strands of hair, natural eyes with real catchlights — clean and healthy (no scars, no acne), never smooth, waxy, plastic or airbrushed.";

/** Image edits: keep the same person. */
export const KEEP_IDENTITY =
  "It is the SAME real person: identical face shape, eyes, nose, lips, skin tone and texture, moles, age, hair and body — do not beautify, " +
  "slim, de-age, smooth the skin or change the face in any way.";

/** Image: what to avoid. */
export const REAL_AVOID =
  "Avoid: airbrushed, waxy or plastic skin, beauty filters, model-perfect faces, perfect symmetry, studio or ring-light glow, HDR, " +
  "bokeh portrait mode, CGI or 3D-render look, extra or fused fingers, distorted hands, text, logos, watermarks, extra people.";

/** Video: keep it human while talking. */
export const REAL_MOTION =
  "Realistic real-time human motion (no slow motion): natural irregular blinking, small eye movements, breathing in the chest and shoulders, " +
  "micro-expressions around the eyes and mouth, cheeks and jaw moving with each syllable, natural teeth and tongue when the mouth opens. " +
  "When the audio pauses, the lips close and stay still (no mouthing without sound) while the face stays alive — a blink, a small nod, a breath, a smile — then speech resumes exactly with the sound. " +
  "Keep the face, identity, skin texture, hair, clothes, body and background exactly as in the image — no face smoothing, no morphing, no warping, " +
  "no flicker, no extra hands or fingers, not robotic, not stiff, no repeating loops.";
