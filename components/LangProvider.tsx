"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { translate, isUiLang, type Key } from "@/lib/i18n";
import { SPEECH_LANGUAGES } from "@/lib/languages";

interface Ctx {
  lang: string;                 // interface language
  setLang: (c: string) => void;
  speech: string;               // language the actors speak
  setSpeech: (c: string) => void;
  t: (k: Key, v?: Record<string, string | number>) => string;
}
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, speech: "en", setSpeech: () => {}, t: (k) => translate("en", k) });
export const useLang = () => useContext(LangCtx);

const isSpeech = (c?: string | null) => !!c && SPEECH_LANGUAGES.some((l) => l.code === c);
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

export default function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState("en");
  const [speech, setSpeechState] = useState("en");

  useEffect(() => {
    const savedUi = get("speakad.lang");
    const savedSpeech = get("speakad.speech");
    if (savedUi && isUiLang(savedUi)) setLangState(savedUi);
    if (savedSpeech && isSpeech(savedSpeech)) setSpeechState(savedSpeech);
    if (savedUi && savedSpeech) return;
    // First visit: language from the visitor's IP (country), then the browser languages.
    const browser = (navigator.languages || [navigator.language]).map((l) => l.toLowerCase().split("-")[0]);
    fetch("/api/geo", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})).then((g: { lang?: string | null }) => {
      const candidates = [g?.lang, ...browser].filter(Boolean) as string[];
      if (!savedUi) setLangState(candidates.find(isUiLang) || "en");
      if (!savedSpeech) setSpeechState(candidates.find(isSpeech) || "en");
    });
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (c: string) => { setLangState(c); set("speakad.lang", c); };
  const setSpeech = (c: string) => { setSpeechState(c); set("speakad.speech", c); };
  const t = useCallback((k: Key, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  return <LangCtx.Provider value={{ lang, setLang, speech, setSpeech, t }}>{children}</LangCtx.Provider>;
}
