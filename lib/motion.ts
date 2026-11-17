/**
 * Motion prompt for the talking-video model (OmniHuman), written the way the model reads best:
 * camera → emotion (visible details, with a progression) → speaking state → gestures & gaze → micro-behaviour.
 * Tailored to the actor's place (car, sofa, walking…) and tone, so the movement looks like a real person filming a selfie video.
 */

const has = (tags: string[], ...k: string[]) => tags.some((t) => k.includes(t));

const TONE: Record<string, string> = {
  Enthusiastic: "genuinely excited: bright eyes, eyebrows lifting on the key words, a wide natural smile that comes and goes",
  Excited: "excited and energetic: eyes widening, quick smiles, a little laugh in the voice showing on the face",
  Friendly: "warm and friendly: soft eyes, a relaxed easy smile, the face softening as if talking to a friend",
  Happy: "happy and relaxed: smiling eyes with small crinkles, cheeks lifting when smiling",
  Calm: "calm and sincere: steady soft gaze, small reassuring smile, slow relaxed nods",
  Serious: "serious and focused: steady eye contact, slightly lowered brows, a firm mouth, small decisive nods on important words",
  Curious: "curious and thoughtful: head tilting slightly, eyebrows raised when asking, a half smile while thinking",
  Sad: "honest and a little vulnerable: softer eyes, a faint sad smile, slower movements",
  Frustrated: "mildly frustrated: brows pulling together, a short exhale, small shakes of the head, then relief",
};

export function motionPrompt(o: { tone?: string; situation?: string[]; gender?: string; shot?: string }) {
  const tags = o.situation || [];
  const inCar = has(tags, "Car");
  const walking = has(tags, "Walking", "Movement");
  const sitting = inCar || has(tags, "Sitting", "Living Room", "Bedroom", "Podcast", "Office", "Coffee Shop");

  // propped camera (tripod / dashboard / table / desk): static frame, both hands free
  const propped = !!o.shot && o.shot !== "selfie" && o.shot !== "vlog";
  if (propped) {
    const emotion0 = TONE[o.tone || ""] || TONE.Friendly;
    const hands0 = o.shot === "holding"
      ? "They hold the cup/object in both hands, now and then lift it slightly or take one hand off it for a small natural gesture, then return."
      : o.shot === "dashboard"
        ? "One hand rests on the steering wheel; the other lifts for relaxed gestures that match the words, then rests again."
        : o.shot === "desk"
          ? "Forearms rest on the desk; both hands make relaxed, natural gestures that match the words — open palms when explaining, a small point when making a point — then rest again."
          : "Both hands are free and make relaxed, natural gestures at chest height that match the words — open palms when explaining, counting on fingers, a small point when making a point — then relax again.";
    return [
      "Static camera on a tripod/stand: the frame does not move; only the person moves naturally within it.",
      `The person is ${emotion0}; the expression starts neutral-friendly and warms up as they get into it.`,
      "They talk directly to the camera like a real person recording a TikTok / Instagram ad — natural conversational delivery with small pauses, lips and jaw clearly articulating every word in sync with the audio.",
      hands0,
      "Natural head movement: small nods on key words, slight tilts, leaning a little toward the camera on important points, small shifts of the shoulders and posture.",
      "Gaze mostly into the lens, briefly glancing away or down when thinking, then back to the camera.",
      "Natural blinking, breathing visible in the chest and shoulders. Keep the face, body, clothing and background exactly as in the image; no camera cuts.",
    ].join(" ");
  }

  const camera = walking
    ? "Handheld phone selfie at arm's length while walking slowly: gentle natural bounce of each step, small sways and micro-shakes of a real hand, the framing drifting a little and correcting."
    : inCar
      ? "Phone held at arm's length in the driver's seat, parked: steady handheld framing with tiny natural micro-movements of the hand."
      : "Handheld phone selfie at arm's length: steady medium close-up with small natural sways and micro-shakes of a real hand, framing drifting slightly and correcting.";

  const emotion = TONE[o.tone || ""] || TONE.Friendly;

  const hands = inCar
    ? "One hand holds the phone; the other rests on the steering wheel and lifts now and then for a small gesture."
    : walking
      ? "One hand holds the phone; the other swings naturally and sometimes gestures briefly."
      : sitting
        ? "One hand holds the phone; the free hand makes relaxed, natural gestures near the chest that match the words — open palm when explaining, a small point when making a point — then rests again."
        : "One hand holds the phone; the free hand makes small natural gestures that match the words, then relaxes.";

  return [
    camera,
    `The person is ${emotion}; the expression starts neutral-friendly and warms up as they get into it.`,
    "They talk directly to the camera like a real person recording a TikTok / Instagram story — natural conversational delivery with small pauses, lips and jaw clearly articulating every word in sync with the audio.",
    hands,
    "Head moves naturally with the speech: small nods and tilts on stressed words, slight turns, shoulders and upper body shifting a little with breathing.",
    "Gaze mostly into the lens, briefly glancing away or down when thinking, then back to the camera.",
    "Natural irregular blinking, subtle breathing, micro-expressions around the eyes and mouth, occasional small smile between phrases.",
    "Keep the face, identity, hair, clothes, body and background exactly as in the image. Realistic human motion — not robotic, not stiff, not frozen, no exaggerated or repeating loops, no extra hands or fingers, no warping.",
  ].join(" ");
}
