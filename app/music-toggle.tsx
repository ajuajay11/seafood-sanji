"use client";

import { useEffect, useRef, useState } from "react";
import type { SoundCue } from "./sound-events";

const cues: Record<SoundCue, string> = {
  nami: "/audio/nami-san.mp3",
  robin: "/audio/robin.mp3",
  girl: "/audio/any_girl.mp3",
  hit: "/audio/sanjihitzoro.mp3",
  kick: "/audio/sanji_kick.mp3",
};
const voices = ["nami", "robin", "girl"] as const;

export default function MusicToggle({ angry, lang }: { angry: boolean; lang: "en" | "ja" }) {
  const audio = useRef<HTMLAudioElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [gameMusic, setGameMusic] = useState(false);
  const enabledRef = useRef(false);
  const effects = useRef<Partial<Record<SoundCue, HTMLAudioElement>>>({});
  // During a run the game is silent apart from Sanji's own kicks and hits.
  const track = angry ? "/audio/angrywhile_zoro_appear.mp3" : "/audio/sanjibgmusic.mp3";

  useEffect(() => {
    const players = Object.fromEntries(Object.entries(cues).map(([cue, src]) => {
      const player = new Audio(src);
      player.preload = "auto";
      player.volume = 0.7;
      return [cue, player];
    })) as Record<SoundCue, HTMLAudioElement>;
    effects.current = players;
    const sound = (event: Event) => {
      if (!enabledRef.current || document.hidden) return;
      const cue = (event as CustomEvent<SoundCue>).detail;
      const player = players[cue];
      if (!player) return;
      // A new greeting replaces the previous voice line; a kick that lands swaps its whoosh for the hit.
      if ((voices as readonly SoundCue[]).includes(cue)) for (const key of voices) players[key].pause();
      if (cue === "hit") players.kick.pause();
      player.currentTime = 0;
      void player.play().catch(() => {});
    };
    const game = (event: Event) => setGameMusic((event as CustomEvent<boolean>).detail);
    const visibility = () => { if (document.hidden) for (const player of Object.values(players)) player.pause(); };
    window.addEventListener("sanji:sound", sound);
    window.addEventListener("sanji:game-music", game);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("sanji:sound", sound);
      window.removeEventListener("sanji:game-music", game);
      document.removeEventListener("visibilitychange", visibility);
      for (const player of Object.values(players)) player.pause();
    };
  }, []);

  useEffect(() => {
    const startOnFirstClick = (event: MouseEvent) => {
      // The toggle handles its own first click, avoiding a double toggle.
      if (event.target instanceof Node && button.current?.contains(event.target)) return;
      const player = audio.current;
      if (!player) return;
      player.volume = 0.35;
      enabledRef.current = true;
      setFailed(false);
      // Play within the gesture so browsers allow audio to start.
      player.play().then(() => setEnabled(true)).catch(() => { enabledRef.current = false; setFailed(true); });
    };
    document.addEventListener("click", startOnFirstClick, { capture: true, once: true });
    return () => document.removeEventListener("click", startOnFirstClick, true);
  }, []);

  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    let active = true;
    player.volume = 0.35;
    player.load();
    if (enabled && !gameMusic && !document.hidden) player.play().catch(() => { if (active) setFailed(true); });
    const visibility = () => {
      if (document.hidden) player.pause();
      else if (enabled && !gameMusic && !player.ended) player.play().catch(() => { if (active) setFailed(true); });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; player.pause(); document.removeEventListener("visibilitychange", visibility); };
  }, [track, enabled, gameMusic]);

  const toggle = () => {
    const player = audio.current;
    if (!player) return;
    setFailed(false);
    if (enabled && !failed) {
      enabledRef.current = false;
      player.pause();
      for (const effect of Object.values(effects.current)) effect?.pause();
      setEnabled(false);
    }
    else {
      enabledRef.current = true;
      // Mid-run the background track stays off; enabling just lets kick and hit effects play.
      if (gameMusic) { setEnabled(true); return; }
      player.volume = 0.35;
      // Start from the user gesture so mobile browsers allow playback.
      player.play().then(() => setEnabled(true)).catch(() => { enabledRef.current = false; setEnabled(false); setFailed(true); });
    }
  };

  return (
    <>
      <audio ref={audio} src={track} loop={!angry} preload="none" />
      <button ref={button} type="button" onClick={toggle} aria-pressed={enabled && !failed} className="fixed top-2 left-2 z-[130] border-2 border-black bg-mellow px-3 py-1 text-xs font-bold shadow-[3px_3px_0_#000]">
        {lang === "ja" ? "音楽" : "Music"}: {failed ? (lang === "ja" ? "再試行" : "Retry") : enabled ? "ON" : "OFF"}
      </button>
    </>
  );
}
