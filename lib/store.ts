"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Actor, Project, Settings } from "./types";

const KEY = "speakad:v1";

export interface AppState {
  projects: Project[];
  currentId: string;
  customActors: Actor[];
  favorites: string[];
  voiceOverrides: Record<string, string>; // actorId -> voiceId
  seedImages: Record<string, string>; // built-in actor id -> generated portrait URL
  settings: Settings;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const newProject = (name = "New Project"): Project => ({
  id: uid(),
  name,
  createdAt: Date.now(),
  generations: [],
});

const initial = (): AppState => {
  const p = newProject();
  return {
    projects: [p],
    currentId: p.id,
    customActors: [],
    favorites: [],
    voiceOverrides: {},
    seedImages: {},
    settings: { model: "omnihuman-1.5", audio: "tts", emotion: "manual", resolution: "720p", keepOriginalVoice: false },
  };
};

export function useAppState() {
  const [state, setState] = useState<AppState>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...initial(), ...JSON.parse(raw) });
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  return [state, update] as const;
}
