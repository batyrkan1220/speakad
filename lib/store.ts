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
  voiceSettings?: Record<string, { speed: number; stability: number; similarity: number; style: number }>; // actorId -> settings
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
    voiceSettings: {},
    seedImages: {},
    settings: { model: "omnihuman-1.5", audio: "tts", emotion: "manual", resolution: "720p", keepOriginalVoice: false },
  };
};

/**
 * App state lives in Supabase (via /api/state). localStorage is only a fallback
 * when Supabase isn't configured, and a one-time source to migrate old data up.
 */
export function useAppState() {
  const [state, setState] = useState<AppState>(initial);
  const mode = useRef<"loading" | "remote" | "local">("loading");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let local: Partial<AppState> | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) local = JSON.parse(raw);
    } catch {}

    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.configured) throw new Error("not configured");
        if (j.error) throw new Error(j.error);
        const remote = j.state as Partial<AppState>;
        const remoteEmpty = !remote.projects?.length && !remote.customActors?.length;
        mode.current = "remote";
        if (remoteEmpty && local) {
          // First run against Supabase: move this browser's data up.
          setState({ ...initial(), ...local });
        } else {
          const next = { ...initial(), ...remote } as AppState;
          if (!next.projects.length) next.projects = initial().projects;
          if (!next.projects.some((p) => p.id === next.currentId)) next.currentId = next.projects[0].id;
          setState(next);
        }
      })
      .catch(() => {
        mode.current = "local";
        if (local) setState({ ...initial(), ...local });
      });
  }, []);

  useEffect(() => {
    if (mode.current === "loading") return;
    if (mode.current === "local") {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {}
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      }).catch(() => {});
    }, 800);
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  return [state, update] as const;
}
