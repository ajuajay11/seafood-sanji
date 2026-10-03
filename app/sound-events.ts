export type SoundCue = "nami" | "robin" | "girl" | "hit";

export function playSound(cue: SoundCue) {
  window.dispatchEvent(new CustomEvent("sanji:sound", { detail: cue }));
}

export function setGameMusic(playing: boolean) {
  window.dispatchEvent(new CustomEvent("sanji:game-music", { detail: playing }));
}
