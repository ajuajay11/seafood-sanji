"use client";

import { useEffect, useRef, useState } from "react";
import { playSound, setGameMusic } from "./sound-events";
import { createGameScene, type SceneLabel, type SceneSprite } from "./game-scene";

type Enemy = { x: number; hit: boolean; fall: number };
type Run = {
  score: number; lives: number; time: number; spawn: number;
  kick: number; cooldown: number; jump: number; enemies: Enemy[]; over: boolean; x: number; started: boolean;
  won: boolean; door: number; scroll: number;
  /** Zoros kicked toward the next Diable Jambe, its seconds left once lit, the high-kick timer and the unlock flash. */
  charge: number; diable: number; special: number; flash: number;
  /** Real seconds of slow motion left after a Diable Jambe connects; whether the current one is aimed at a Zoro. */
  slow: number; aimed: boolean;
};
const GOAL = 4000;
/** After a win the slammed door and CLOSED sign hold this long, then the page reloads to the homepage. */
const WIN_HOLD_MS = 2500;
// Characters are kept short so a full jump still clears the HUD drawn over the top of the stage.
const CHARACTER_HEIGHT = 105;
const JUMP_HEIGHT = 100;
// The walk sheet has two passing poses (1, 3) but three near-identical strides (4–6); playing all
// seven reads as a limp, so Zoro loops the even stride → pass → stride → pass steps only.
const ZORO_WALK = [0, 1, 2, 3];
const ZORO_WALK_FPS = 6;
const LEFT_KEYS = ["ArrowLeft", "KeyA"];
const RIGHT_KEYS = ["ArrowRight", "KeyD"];
// Diable Jambe (悪魔風脚): every DIABLE_CHARGE Zoros kicked lights Sanji's leg for DIABLE_SECONDS, and
// L throws the flaming high kick: longer reach, can fell several Zoros at once, DIABLE_POINTS each.
const DIABLE_CHARGE = 5;
const DIABLE_SECONDS = 20;
const DIABLE_POINTS = 200;
const DIABLE_KICK = 0.6;
// The flaming kick plays in slow motion: the world (Zoros, sea, Sanji's own leg) runs at this
// fraction of real time while it is thrown and for DIABLE_SLOW_HOLD seconds after it lands.
const DIABLE_SLOW = 0.3;
const DIABLE_SLOW_HOLD = 0.9;
/** Head centre of each Diable Jambe frame as a fraction of its width (printed by scripts/split-sanji-frames.mjs). */
const DIABLE_HEAD = [0.292, 0.554, 0.259, 0.26, 0.317, 0.242, 0.345];

/** Horizontal centre of the torso (15–40% down the frame), in image pixels. Each pose is cropped to
 *  its own silhouette, so the box centre drifts with the legs; anchoring on the torso keeps him steady. */
const torsoCentre = (image: HTMLImageElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return image.naturalWidth / 2;
  context.drawImage(image, 0, 0);
  const top = Math.round(canvas.height * 0.15), bottom = Math.round(canvas.height * 0.4);
  const { data } = context.getImageData(0, top, canvas.width, bottom - top);
  let sum = 0, count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 128) { sum += ((index - 3) / 4) % canvas.width; count++; }
  return count ? sum / count : image.naturalWidth / 2;
};
const RUN_SPEED = 300;
const CAMERA_LEFT = 125, CAMERA_RIGHT = 420;
const ZORO_GAP = 1000; // canvas units; the canvas spans the full viewport width, so this is 100dvw.
const freshRun = (): Run => ({ score: 0, lives: 3, time: 0, spawn: 150, kick: 0, cooldown: 0, jump: 0, enemies: [], over: false, x: 125, started: false, won: false, door: 0, scroll: 0, charge: 0, diable: 0, special: 0, flash: 0, slow: 0, aimed: false });

export default function ZoroGame({ lang, onClose }: { lang: "en" | "ja"; onClose: () => void }) {
  const ja = lang === "ja";
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const jaRef = useRef(ja);
  const touchRef = useRef(false);
  const run = useRef<Run>(freshRun());
  const blocked = useRef(true);
  const direction = useRef(0);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobileControls, setMobileControls] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ score: 0, lives: 3, over: false, won: false, charge: 0, diable: 0 });
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => { jaRef.current = ja; }, [ja]);

  // Sanji is satisfied: once the kitchen door has slammed shut, reload the (single-page) site so the
  // player lands back on a fresh homepage.
  useEffect(() => {
    if (!hud.over || !hud.won) return;
    const timer = window.setTimeout(() => window.location.reload(), WIN_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [hud.over, hud.won]);

  useEffect(() => {
    setGameMusic(started && !portrait && !paused && !hud.over);
    return () => setGameMusic(false);
  }, [started, portrait, paused, hud.over]);

  const kick = () => {
    const r = run.current;
    if (!blocked.current && r.started && !r.over && r.cooldown <= 0) { r.kick = 0.48; r.cooldown = 0.55; playSound("kick"); }
  };
  const diableJambe = () => {
    const r = run.current;
    if (!blocked.current && r.started && !r.over && r.diable > 0 && r.cooldown <= 0) {
      r.special = DIABLE_KICK; r.kick = 0; r.cooldown = 0.7; playSound("kick");
      // Slow motion only for a kick thrown at a Zoro close enough to be caught by it, not one swung at thin air.
      r.aimed = r.enemies.some((enemy) => !enemy.hit && enemy.x > r.x - 10 && enemy.x < r.x + 320);
    }
  };
  const jump = () => {
    const r = run.current;
    if (!blocked.current && r.started && !r.over && r.jump <= 0) r.jump = 0.85;
  };
  const restart = () => { run.current = { ...freshRun(), started: true }; direction.current = 0; setStarted(true); setHud({ score: 0, lives: 3, over: false, won: false, charge: 0, diable: 0 }); };

  useEffect(() => {
    closeButton.current?.focus();
    const orientation = window.matchMedia("(orientation: portrait)");
    const mobile = window.matchMedia("(any-pointer: coarse)");
    const update = () => {
      const rotate = mobile.matches && orientation.matches;
      const hidden = document.hidden;
      blocked.current = rotate || hidden;
      setPortrait(rotate);
      setMobileControls(mobile.matches);
      touchRef.current = mobile.matches;
      if (rotate || hidden) direction.current = 0;
      setPaused(hidden);
    };
    const initialize = requestAnimationFrame(() => {
      update();
      try {
        const saved = Number(sessionStorage.getItem("sanji:zoro-best"));
        if (Number.isFinite(saved) && saved > 0) { bestRef.current = saved; setBest(saved); }
      } catch { /* Session storage may be disabled. */ }
    });
    orientation.addEventListener("change", update);
    mobile.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const keyboard = (event: KeyboardEvent) => {
      if (event.code === "Escape") { onClose(); return; }
      if (["KeyK", "KeyJ", "KeyL", ...LEFT_KEYS, ...RIGHT_KEYS].includes(event.code)) {
        event.preventDefault();
        if (!run.current.started || blocked.current || run.current.over) return;
        if (LEFT_KEYS.includes(event.code)) direction.current = -1;
        else if (RIGHT_KEYS.includes(event.code)) direction.current = 1;
        else if (!event.repeat) { if (event.code === "KeyK") kick(); else if (event.code === "KeyL") diableJambe(); else jump(); }
      }
    };
    const release = (event: KeyboardEvent) => {
      if ((LEFT_KEYS.includes(event.code) && direction.current === -1) || (RIGHT_KEYS.includes(event.code) && direction.current === 1)) direction.current = 0;
    };
    const blur = () => { direction.current = 0; };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(initialize);
      orientation.removeEventListener("change", update);
      mobile.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  }, [onClose]);

  useEffect(() => {
    if (!canvas.current || !overlay.current) return;
    const stage = createGameScene(canvas.current, overlay.current);
    const loadImage = (src: string) => { const image = new window.Image(); image.src = src; return image; };
    const loadFrames = (name: string, count = 8) => Array.from({ length: count }, (_, index) => loadImage(`/frames/${name}/${index}.png`));
    const running = loadFrames("run");
    const kicking = loadFrames("kick");
    const walking = loadFrames("zoro-walk", 7);
    const falling = loadFrames("zoro-fall", 7);
    const flaming = loadFrames("diable-jambe", 7);
    const grass = loadImage("/frames/grass.jpg");
    const ships = loadImage("/frames/ships.png");
    const walkAnchor = new Map<HTMLImageElement, number>();
    let active = true;
    // Textures are only built after every image has decoded (Safari can report `complete` early).
    Promise.all([...running, ...kicking, ...walking, ...falling, ...flaming, grass, ships].map((image) => image.decode())).then(() => {
      if (!active) return;
      for (const image of walking) walkAnchor.set(image, torsoCentre(image));
      stage.setAssets({ grass, ships });
      setReady(true);
    }).catch(() => { /* Keep the loading screen if an asset cannot be decoded. */ });
    let swell = 0;
    let timeScale = 1;
    let frame = 0;
    let previous = 0;
    const paint = (now: number) => {
      const realDt = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
      // Ease in and out of slow motion instead of snapping, so the kick reads as a dramatic beat.
      const slowMo = (run.current.special > 0 && run.current.aimed) || run.current.slow > 0;
      timeScale += ((slowMo ? DIABLE_SLOW : 1) - timeScale) * Math.min(1, realDt * 10);
      const dt = realDt * timeScale;
      previous = now;
      const r = run.current;
      if (!blocked.current && r.started && !r.over) {
        // Follow camera: Sanji walks freely between CAMERA_LEFT and CAMERA_RIGHT; past either edge he
        // holds his spot and the world (ground, sea, ships, Zoros) scrolls by exactly his step instead.
        const next = r.x + direction.current * RUN_SPEED * dt;
        const camera = next > CAMERA_RIGHT ? next - CAMERA_RIGHT : next < CAMERA_LEFT ? next - CAMERA_LEFT : 0;
        r.x = next - camera;
        r.scroll += camera;
        for (const enemy of r.enemies) enemy.x -= camera;
        r.time += dt; r.kick = Math.max(0, r.kick - dt); r.cooldown = Math.max(0, r.cooldown - dt); r.jump = Math.max(0, r.jump - dt);
        r.special = Math.max(0, r.special - dt); // The 20 s Diable Jambe window and its banners count real time, not slowed time.
        r.flash = Math.max(0, r.flash - realDt); r.diable = Math.max(0, r.diable - realDt); r.slow = Math.max(0, r.slow - realDt);
        const speed = Math.min(300, 120 + r.time * 2);
        // Spawn by distance, not time: the next Zoro enters once the previous one has covered a full
        // screen width (walking plus camera scroll), so neighbours are always 100dvw apart.
        r.spawn -= speed * dt + camera;
        if (r.spawn <= 0) {
          r.enemies.push({ x: 1030, hit: false, fall: 0 });
          r.spawn += ZORO_GAP;
        }
        for (const enemy of r.enemies) {
          if (enemy.hit) {
            enemy.fall += dt;
            if (enemy.fall < 0.6) enemy.x += 90 * dt;
            continue;
          }
          enemy.x -= speed * dt;
          // The flaming leg lands while it is raised (frames 3–5) and reaches further than a normal kick.
          const highKick = r.special > 0.09 && r.special < 0.35 && enemy.x < r.x + 175 && enemy.x > r.x - 10;
          if (!enemy.hit && (highKick || (r.kick > 0.08 && r.kick < 0.36 && enemy.x < r.x + 115 && enemy.x > r.x + 5))) {
            enemy.hit = true; r.score += highKick ? DIABLE_POINTS : 100;
            if (highKick) r.slow = DIABLE_SLOW_HOLD;
            playSound("hit");
            // Normal kicks charge the next Diable Jambe; the charge waits while the leg is already lit.
            if (!highKick && r.diable <= 0 && ++r.charge >= DIABLE_CHARGE) { r.charge = 0; r.diable = DIABLE_SECONDS; r.flash = 1.8; }
            // Satisfied: Sanji swoons (any_girl.mp3) as the kitchen doors slam on the mossheads.
            if (r.score >= GOAL) { r.won = true; r.over = true; playSound("girl"); break; }
          } else if (!enemy.hit && enemy.x < r.x + 40 && enemy.x + 54 > r.x + 15 && r.jump < 0.15) {
            enemy.hit = true; r.lives -= 1;
            if (r.lives === 0) { r.over = true; break; }
          }
        }
        r.enemies = r.enemies.filter((enemy) => enemy.x > -160 && (!enemy.hit || enemy.fall < 1.2));
        if (r.score > bestRef.current) {
          bestRef.current = r.score; setBest(r.score);
          try { sessionStorage.setItem("sanji:zoro-best", String(r.score)); } catch { /* Play without storage. */ }
        }
      }
      if (!blocked.current) swell += dt;
      if (r.won && !blocked.current) r.door = Math.min(1, r.door + realDt * 1.4);
      // A win only shows its overlay once the kitchen door has slammed shut.
      const over = r.over && (!r.won || r.door >= 1);
      const diable = Math.ceil(r.diable);
      setHud((old) => old.score === r.score && old.lives === r.lives && old.over === over && old.won === r.won && old.charge === r.charge && old.diable === diable ? old : { score: r.score, lives: r.lives, over, won: r.won, charge: r.charge, diable });

      const ja = jaRef.current;
      const sprites: SceneSprite[] = [];
      const labels: SceneLabel[] = [];
      const lift = r.jump > 0 ? Math.sin((r.jump / 0.85) * Math.PI) * JUMP_HEIGHT : 0;
      const moving = direction.current !== 0 || r.jump > 0;
      // Standing still uses the upright guard stance that opens the kick sheet.
      const pose = r.kick > 0 ? kicking[Math.min(7, Math.floor((1 - r.kick / 0.48) * 8))] : moving ? running[Math.floor(r.time * 12) % 8] : kicking[0];
      // Same on-screen height as Zoro: Sanji's standing pose is scaled to CHARACTER_HEIGHT.
      const sanjiScale = CHARACTER_HEIGHT / Math.max(kicking[0].naturalHeight, 1);
      const sanjiWidth = pose.naturalWidth * sanjiScale;
      if (r.special > 0) {
        // Diable Jambe frames are cropped round the flames; hold the head where the guard stance has it.
        const index = Math.min(6, Math.floor((1 - r.special / DIABLE_KICK) * 7)), flame = flaming[index];
        const scale = CHARACTER_HEIGHT / Math.max(flaming[0].naturalHeight, 1), width = flame.naturalWidth * scale;
        const head = r.x - 20 + (kicking[0].naturalWidth * sanjiScale) / 2;
        sprites.push({ image: flame, x: head + (0.5 - DIABLE_HEAD[index]) * width, width, height: flame.naturalHeight * scale, lift });
        labels.push({ text: ja ? "悪魔風脚！" : "DIABLE JAMBE!", x: r.x + 110, y: CHARACTER_HEIGHT + 70 + lift, color: "#ff7a1a", size: 26 });
      } else {
        sprites.push({ image: pose, x: r.x - 20 + sanjiWidth / 2, width: sanjiWidth, height: pose.naturalHeight * sanjiScale, lift });
        if (r.kick > 0) labels.push({ text: "KICK!", x: r.x + 125, y: CHARACTER_HEIGHT - 5 + lift, color: "#ff6584", size: 22 });
      }
      if (r.flash > 0) labels.push({ text: touchRef.current ? (ja ? "悪魔風脚 解放！" : "DIABLE JAMBE UNLOCKED!") : (ja ? "悪魔風脚 解放！ L で蹴れ！" : "DIABLE JAMBE UNLOCKED! PRESS L"), x: 500, y: CHARACTER_HEIGHT + 110, color: "#ff7a1a", size: 30 });
      const zoroScale = CHARACTER_HEIGHT / Math.max(...walking.map((image) => image.naturalHeight), 1);
      for (const enemy of r.enemies) {
        const zoroPose = enemy.hit ? falling[Math.min(6, Math.floor(enemy.fall * 10))] : walking[ZORO_WALK[Math.floor(r.time * ZORO_WALK_FPS) % ZORO_WALK.length]];
        const anchor = walkAnchor.get(zoroPose);
        const shift = anchor === undefined ? 0 : (zoroPose.naturalWidth / 2 - anchor) * zoroScale;
        sprites.push({ image: zoroPose, x: enemy.x + 27 + shift, width: zoroPose.naturalWidth * zoroScale, height: zoroPose.naturalHeight * zoroScale, lift: 0 });
        if (enemy.hit && enemy.fall < 0.6) labels.push({ text: "POW!", x: enemy.x + 27, y: CHARACTER_HEIGHT + 30, color: "#ff6584", size: 26 });
      }
      stage.render({
        scroll: r.scroll, swell, sprites, labels, won: r.won, door: r.door, slowMo: (1 - timeScale) / (1 - DIABLE_SLOW),
        caption: ja ? "厨房に迷い込んだマリモ軍団！" : "HE GOT LOST. NOW THERE ARE MILLIONS.",
        closedTitle: ja ? "閉店" : "CLOSED", closedSub: ja ? "マリモお断り" : "NO MOSSHEADS ALLOWED",
      });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { active = false; cancelAnimationFrame(frame); stage.dispose(); };
  }, []);

  const controlsDisabled = portrait || hud.over || !started;
  const control = "touch-none border-[3px] border-black px-[1.4cqw] py-[0.6cqw] font-display text-[clamp(16px,2.6cqw,28px)] leading-none disabled:opacity-40";
  return (
    <section role="dialog" aria-modal="true" aria-labelledby="zoro-game-title" className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-parchment">
      {/* The stage fills the viewport (100dvw × 100dvh); the scene keeps its width in game units and
          shows more or less sky to match the height. HUD and controls are absolute and sized in cqw. */}
      <div
        hidden={portrait}
        className="@container relative h-dvh w-dvw shrink-0 overflow-hidden"
      >
        <canvas ref={canvas} aria-label={ja ? "サンジが走りながらゾロをキックするゲーム" : "Sanji runner: kick approaching Zoros to earn 100 points each"} className="absolute inset-0 block h-full w-full" />
        <canvas ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
        {/* A win leaves the stage uncovered so the shut door and CLOSED sign stay in view until the reload. */}
        {hud.over && hud.won && (
          <p role="status" className="absolute inset-x-0 bottom-[12cqw] mx-auto w-fit border-[3px] border-black bg-parchment px-[2cqw] py-[0.8cqw] text-center font-display text-[clamp(16px,2.4cqw,26px)] shadow-[4px_4px_0_#000]">
            {ja ? "満足だ。厨房の扉は閉めたぜ、マリモ！ ホームへ戻ります…" : "Sanji is satisfied. Door's shut, mosshead! Heading home…"}
          </p>
        )}
        {(paused || (hud.over && !hud.won) || !started) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1.6cqw] bg-parchment/95 p-[2cqw] pt-[10cqw] text-center text-[clamp(12px,1.8cqw,18px)]">
            <h3 className="font-display text-[clamp(22px,4.4cqw,44px)] leading-tight">{hud.over ? (ja ? "マリモに厨房を乗っ取られた！" : "The mosshead stole your kitchen!") : !started ? (ja ? "マリモ退治の準備はいいか？" : "Ready to mow the mosshead?") : (ja ? "一時停止" : "Paused")}</h3>
            <p>{!started ? (ja ? "開始するまでゾロは待機中。" : "The mossheads can wait. Start when you’re ready.") : `${ja ? "得点" : "Points"}: ${hud.score}`}</p>
            {!started && <button disabled={!ready} onClick={restart} className="border-4 border-black bg-mellow px-[2.4cqw] py-[1.2cqw] font-display text-[clamp(18px,3cqw,30px)] disabled:opacity-50">{!ready ? (ja ? "読み込み中…" : "Loading frames…") : mobileControls ? (ja ? "タップして開始" : "Tap to start") : (ja ? "クリックして開始" : "Click to start")}</button>}
            {hud.over && <button onClick={restart} className="border-4 border-black bg-rose px-[2.4cqw] py-[0.8cqw] font-display text-[clamp(16px,2.4cqw,24px)]">{ja ? "もう一度蹴っ飛ばす" : "Rematch, mosshead!"}</button>}
          </div>
        )}
        {/* HUD: title, stats and Back along the top edge, the satisfaction meter just under them. */}
        <div className="absolute inset-x-0 top-0 flex flex-col gap-[0.8cqw] p-[1.4cqw] text-[clamp(11px,1.6cqw,16px)]">
          {/* Left gap keeps the title clear of the page's fixed music toggle when the stage meets the top edge. */}
          <header className="flex items-center justify-between gap-[1.4cqw] pl-[100px]">
            <h2 id="zoro-game-title" className="font-display text-[clamp(18px,3.2cqw,36px)] leading-none [text-shadow:0_0_4px_#fdfbf7,0_0_8px_#fdfbf7]">{ja ? "マリモを蹴っ飛ばせ！" : "Beat the Mosshead!"}</h2>
            <div className="flex items-center gap-[1.2cqw]">
              <p className="border-2 border-black bg-parchment/85 px-[1cqw] py-[0.3cqw] font-bold whitespace-nowrap">{ja ? "得点" : "Points"}: {hud.score} · {ja ? "ライフ" : "Lives"}: {hud.lives} · {ja ? "最高" : "Best"}: {best}</p>
              <button ref={closeButton} onClick={onClose} className="border-2 border-black bg-parchment px-[1.2cqw] py-[0.3cqw] font-bold">{ja ? "戻る" : "Back"}</button>
            </div>
          </header>
          {/* A compact meter: a third of the stage wide, not the full width. */}
          <div className="flex w-[min(34cqw,380px)] min-w-[220px] items-center gap-[0.8cqw] text-[clamp(10px,1.3cqw,13px)]">
            <span className="shrink-0 font-bold [text-shadow:0_0_4px_#fdfbf7,0_0_8px_#fdfbf7]">{ja ? "サンジ満足度" : "Sanji's satisfaction"}</span>
            <div role="progressbar" aria-label={ja ? "サンジ満足度" : "Sanji's satisfaction"} aria-valuemin={0} aria-valuemax={GOAL} aria-valuenow={Math.min(hud.score, GOAL)} className="relative h-[max(14px,1.6cqw)] flex-1 overflow-hidden border-2 border-black bg-white">
              <div className="h-full bg-rose transition-[width] duration-300 ease-out" style={{ width: `${Math.min(hud.score / GOAL, 1) * 100}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-[clamp(9px,1cqw,11px)] leading-none font-bold">{Math.min(hud.score, GOAL)} / {GOAL}{hud.won ? " ♡" : ""}</span>
            </div>
          </div>
          {/* Diable Jambe status: charge pips while building up, a burning countdown once lit. */}
          <div aria-live="polite" className="self-start">
            {hud.diable > 0 ? (
              <p className="diable-lit relative overflow-hidden border-[3px] border-black px-[1cqw] py-[0.3cqw] font-display text-[clamp(14px,2cqw,22px)] leading-none tracking-wide text-white">
                <span className="relative">{ja ? `悪魔風脚！${mobileControls ? "" : " L で蹴れ"} · ${hud.diable}秒` : `DIABLE JAMBE!${mobileControls ? "" : " Press L"} · ${hud.diable}s`}</span>
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/80 transition-[width] duration-1000 ease-linear" style={{ width: `${(hud.diable / DIABLE_SECONDS) * 100}%` }} />
              </p>
            ) : (
              <p className="flex items-center gap-[0.6cqw] border-2 border-black bg-parchment/85 px-[1cqw] py-[0.3cqw] font-bold">
                {ja ? "悪魔風脚" : "Diable Jambe"}
                <span aria-hidden="true" className="flex gap-[0.4cqw]">
                  {Array.from({ length: DIABLE_CHARGE }, (_, index) => <span key={index} className={`size-[max(9px,1.1cqw)] rotate-45 border-2 border-black ${index < hud.charge ? "bg-[#ff7a1a]" : "bg-white"}`} />)}
                </span>
                <span className="sr-only">{hud.charge} / {DIABLE_CHARGE}</span>
              </p>
            )}
          </div>
        </div>
        {/* Bottom edge: run buttons on the left thumb, jump and kick on the right; tips in between. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-[1.4cqw] p-[1.4cqw]">
          {mobileControls && <div className="pointer-events-auto flex shrink-0 gap-[1cqw]">
            {([-1, 1] as const).map((value) => <button key={value} aria-label={value < 0 ? "Run left" : "Run right"} disabled={controlsDisabled} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); direction.current = value; }} onPointerUp={() => { direction.current = 0; }} onPointerCancel={() => { direction.current = 0; }} onLostPointerCapture={() => { direction.current = 0; }} className={`${control} min-w-[max(44px,6cqw)] bg-white`}>{value < 0 ? "←" : "→"}</button>)}
          </div>}
          <p className={`max-w-[50cqw] border-2 border-black bg-parchment/85 px-[1cqw] py-[0.4cqw] text-[clamp(10px,1.3cqw,14px)] ${mobileControls ? "hidden text-center @min-[640px]:block" : ""}`}>
            {ja ? "1体100点！" : "100 points per Zoro!"} {ja ? `${DIABLE_CHARGE}体蹴ると${DIABLE_SECONDS}秒間の悪魔風脚（1体${DIABLE_POINTS}点）。` : `Kick ${DIABLE_CHARGE} and Diable Jambe burns for ${DIABLE_SECONDS}s (${DIABLE_POINTS} each).`} {ja ? "近づいたらキック、ジャンプで回避！" : "Kick when close. Jump to dodge."}
          </p>
          {mobileControls ? <div className="pointer-events-auto flex shrink-0 gap-[1cqw]">
            <button disabled={controlsDisabled} onPointerDown={(e) => { e.preventDefault(); jump(); }} onClick={(e) => { if (e.detail === 0) jump(); }} className={`${control} min-h-[44px] bg-mellow`}>{ja ? "ジャンプ" : "Jump"}</button>
            <button disabled={controlsDisabled} onPointerDown={(e) => { e.preventDefault(); kick(); }} onClick={(e) => { if (e.detail === 0) kick(); }} className={`${control} min-h-[44px] bg-rose`}>{ja ? "キック" : "Kick"}</button>
            <button aria-label="Diable Jambe" disabled={controlsDisabled || hud.diable <= 0} onPointerDown={(e) => { e.preventDefault(); diableJambe(); }} onClick={(e) => { if (e.detail === 0) diableJambe(); }} className={`${control} min-h-[44px] text-white ${hud.diable > 0 ? "diable-lit" : "bg-black/60"}`}>{ja ? "悪魔風脚" : "Diable"}</button>
          </div> : <p className="shrink-0 border-2 border-black bg-parchment/85 px-[1cqw] py-[0.4cqw] text-[clamp(11px,1.5cqw,15px)] font-bold">{ja ? "K：キック · L：悪魔風脚 · J：ジャンプ · ← → / A D：走る" : "K to kick · L for Diable Jambe · J to jump · ← → or A D to run"}</p>}
        </div>
      </div>
      {/* Phones in portrait: no game, no HUD, just a prompt to rotate. The run stays paused meanwhile. */}
      {portrait && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-6 text-center">
          <span aria-hidden="true" className="inline-block h-20 w-12 rotate-hint rounded-lg border-4 border-black" />
          <h3 className="font-display text-4xl">{ja ? "スマホまで迷子か？横向きに！" : "Even your phone got lost. Turn it sideways!"}</h3>
          <p>{ja ? "横画面に回転してプレイしてください。" : "Please rotate your device to landscape mode to play."}</p>
          <button onClick={onClose} className="border-2 border-black px-3 py-1 font-bold">{ja ? "戻る" : "Back"}</button>
        </div>
      )}
    </section>
  );
}
