export type Gender = "Female" | "Male";
export type Age = "Young Adult" | "Adult" | "Senior" | "Kid";

export interface Actor {
  id: string;
  name: string;
  gender: Gender;
  age: Age;
  situation: string[]; // e.g. Car, Kitchen, Podcast
  accessories: string[]; // e.g. Phone, Mic
  emotion: string; // dominant look: Happy, Calm...
  hd?: boolean;
  isNew?: boolean;
  image: string; // portrait URL (Supabase storage)
  video?: string; // preview clip, plays on hover
  sourceAudio?: string; // the actor's own voice sample (for cloning)
  voiceId?: string; // ElevenLabs voice id
  prompt?: string; // generation prompt (seed / create)
  custom?: boolean; // created by the user ("My actors")
}

export type ModelId = "omnihuman-1.5" | "omnihuman-1.5-turbo";
export type AudioMode = "tts" | "sts";
export type EmotionMode = "manual" | "auto";
export type Resolution = "720p" | "1080p";

export interface Settings {
  model: ModelId;
  audio: AudioMode;
  emotion: EmotionMode;
  resolution: Resolution;
  keepOriginalVoice: boolean; // STS: use uploaded voice as-is
}

export type JobStatus = "queued" | "voicing" | "rendering" | "done" | "error";

export interface Generation {
  id: string;
  actorId: string;
  actorName: string;
  actorImage: string;
  script: string;
  status: JobStatus;
  requestId?: string;
  videoUrl?: string;
  audioUrl?: string;
  error?: string;
  createdAt: number;
  duration?: number;
}

export interface Project {
  id: string;
  name: string;
  folder?: string;
  createdAt: number;
  generations: Generation[];
}
