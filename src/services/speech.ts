import { useSyncExternalStore } from "react";

type Status = "idle" | "loading" | "playing" | "error";
type Snapshot = {
  voices: SpeechSynthesisVoice[];
  supported: boolean;
  voiceURI: string;
  rate: number;
  owner: symbol | null;
  status: Status;
  error: string;
};
const key = "thai-everyday-speech-v1";
let state: Snapshot = {
  voices: [],
  supported: false,
  voiceURI: "",
  rate: 1,
  owner: null,
  status: "idle",
  error: "",
};
const listeners = new Set<() => void>();
let initialized = false;
let active: SpeechSynthesisUtterance | null = null;
let startTimer: ReturnType<typeof setTimeout> | undefined;
let endTimer: ReturnType<typeof setTimeout> | undefined;
function publish(patch: Partial<Snapshot>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
function initialize() {
  if (initialized) return;
  initialized = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    state = {
      ...state,
      voiceURI: typeof saved.voiceURI === "string" ? saved.voiceURI : "",
      rate: saved.rate === 0.8 ? 0.8 : 1,
    };
  } catch {
    /* Speech remains available when website storage is blocked. */
  }
  state = {
    ...state,
    supported:
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  };
  if (state.supported) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    refreshVoices();
    window.addEventListener("pagehide", () => stopSpeech());
  }
}
export function refreshVoices() {
  if (!state.supported) return;
  publish({
    voices: window.speechSynthesis
      .getVoices()
      .filter((v) => /^th(?:[-_]|$)/i.test(v.lang)),
  });
}
export function selectedVoice() {
  return (
    state.voices.find((v) => v.voiceURI === state.voiceURI) ??
    state.voices.find((v) => /Narisa/i.test(v.name) && v.localService) ??
    state.voices.find((v) => v.default) ??
    state.voices.find((v) => v.localService) ??
    state.voices[0]
  );
}
export function setSpeechPreferences(voiceURI: string, rate: number) {
  stopSpeech();
  publish({ voiceURI, rate: rate === 0.8 ? 0.8 : 1 });
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ voiceURI: state.voiceURI, rate: state.rate }),
    );
  } catch {
    /* Keep session preferences. */
  }
}
function clearActive() {
  clearTimeout(startTimer);
  clearTimeout(endTimer);
  active = null; // Invalidate callbacks before cancel(), which may emit an error.
}
export function stopSpeech(owner?: symbol) {
  if (owner && state.owner !== owner) return;
  const hadActive = active !== null;
  clearActive();
  if (hadActive) window.speechSynthesis.cancel();
  publish({ owner: null, status: "idle", error: "" });
}
export function playSpeech(
  text: string,
  owner: symbol,
  onError: (message: string) => void,
) {
  initialize();
  stopSpeech();
  refreshVoices();
  const fail = (message: string) => {
    const hadActive = active !== null;
    clearActive();
    if (hadActive) window.speechSynthesis.cancel();
    publish({ owner, status: "error", error: message });
    onError(message);
  };
  if (!state.supported) return fail("此浏览器不支持网页朗读。");
  const voice = selectedVoice();
  if (!voice)
    return fail(
      "当前浏览器没有可用的泰语声音。请在网页「朗读设置」中刷新声音列表；网页不会安装语音包或修改系统设置。",
    );
  if (!text.trim()) return;
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text.trim());
  active = utterance; // Retain the utterance throughout playback.
  utterance.voice = voice;
  utterance.lang = "th-TH";
  utterance.rate = state.rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  let startedAt: number | undefined;
  publish({ owner, status: "loading", error: "" });
  utterance.onstart = () => {
    if (active !== utterance) return;
    clearTimeout(startTimer);
    startedAt = performance.now();
    publish({ status: "playing" });
    endTimer = setTimeout(
      () => {
        if (active === utterance)
          fail("朗读等待过久，请在网页「朗读设置」中换一个泰语声音后重试。");
      },
      Math.max(30000, text.length * 1500),
    );
  };
  utterance.onend = () => {
    if (active !== utterance) return;
    // A full Thai word ending immediately is a known silent-engine symptom.
    // Report uncertainty, never pretend this proves audible output.
    if (
      startedAt === undefined ||
      (text.length >= 4 && performance.now() - startedAt < 180)
    ) {
      fail(
        "语音过快结束，可能没有发声。请在网页「朗读设置」中换一个泰语声音试听。",
      );
      return;
    }
    clearActive();
    publish({ owner: null, status: "idle", error: "" });
  };
  utterance.onerror = (event) => {
    if (active !== utterance) return;
    if (event.error === "canceled" || event.error === "interrupted") {
      clearActive();
      publish({ owner: null, status: "idle" });
      return;
    }
    fail(
      event.error === "network"
        ? "此声音需要联网，连接失败。请换用列表中的本地声音。"
        : "泰语朗读失败，请在网页「朗读设置」中换一个声音试听。",
    );
  };
  startTimer = setTimeout(() => {
    if (active === utterance)
      fail("语音未能开始。请在网页「朗读设置」中换一个泰语声音后重试。");
  }, 8000);
  try {
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  } catch {
    fail("泰语朗读无法启动，请换一个声音试听。");
  }
}
const subscribe = (listener: () => void) => {
  initialize();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useSpeech() {
  return useSyncExternalStore(subscribe, () => state);
}
