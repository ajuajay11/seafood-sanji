"use client";

import { useEffect, useRef, useState } from "react";
import { playSound, setGameMusic } from "./sound-events";

type Enemy = { x: number; hit: boolean; fall: number };
type Run = {
  score: number; lives: number; time: number; spawn: number;
  kick: number; cooldown: number; jump: number; enemies: Enemy[]; over: boolean; x: number; started: boolean;
  won: boolean; door: number; scroll: number;
};
const GOAL = 5000;
const CHARACTER_HEIGHT = 140;
const RUN_SPEED = 300;
const CAMERA_LEFT = 125, CAMERA_RIGHT = 420;
const ZORO_GAP = 1000; // canvas units; the canvas spans the full viewport width, so this is 100dvw.
const freshRun = (): Run => ({ score: 0, lives: 3, time: 0, spawn: 150, kick: 0, cooldown: 0, jump: 0, enemies: [], over: false, x: 125, started: false, won: false, door: 0, scroll: 0 });

export default function ZoroGame({ lang, onClose }: { lang: "en" | "ja"; onClose: () => void }) {
  const ja = lang === "ja";
  const canvas = useRef<HTMLCanvasElement>(null);
  const run = useRef<Run>(freshRun());
  const blocked = useRef(true);
  const direction = useRef(0);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [mobileControls, setMobileControls] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ score: 0, lives: 3, over: false, won: false });
  const [best, setBest] = useState(0);
  const bestRef = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setGameMusic(started && !portrait && !paused && !hud.over);
    return () => setGameMusic(false);
  }, [started, portrait, paused, hud.over]);

  const kick = () => {
    const r = run.current;
    if (!blocked.current && r.started && !r.over && r.cooldown <= 0) { r.kick = 0.48; r.cooldown = 0.55; }
  };
  const jump = () => {
    const r = run.current;
    if (!blocked.current && r.started && !r.over && r.jump <= 0) r.jump = 0.85;
  };
  const restart = () => { run.current = { ...freshRun(), started: true }; direction.current = 0; setStarted(true); setHud({ score: 0, lives: 3, over: false, won: false }); };

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
      if (["KeyK", "KeyJ", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
        if (!run.current.started || blocked.current || run.current.over) return;
        if (event.code === "ArrowLeft") direction.current = -1;
        else if (event.code === "ArrowRight") direction.current = 1;
        else if (!event.repeat) { if (event.code === "KeyK") kick(); else jump(); }
      }
    };
    const release = (event: KeyboardEvent) => {
      if ((event.code === "ArrowLeft" && direction.current === -1) || (event.code === "ArrowRight" && direction.current === 1)) direction.current = 0;
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
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const loadFrames = (name: string, count = 8) => Array.from({ length: count }, (_, index) => {
      const image = new window.Image(); image.src = `/frames/${name}/${index}.png`; return image;
    });
    const running = loadFrames("run");
    const kicking = loadFrames("kick");
    const walking = loadFrames("zoro-walk", 7);
    const falling = loadFrames("zoro-fall", 7);
    const loadImage = (src: string) => { const image = new window.Image(); image.src = src; return image; };
    const grass = loadImage("/frames/grass.jpg");
    const ships = loadImage("/frames/ships.png");
    let active = true;
    Promise.all([...running, ...kicking, ...walking, ...falling, grass, ships].map((image) => image.decode())).then(() => {
      if (active) setReady(true);
    }).catch(() => { /* Keep the loading screen if an asset cannot be decoded. */ });
    // Source rects inside ships.png: Sunny facing right, Merry facing left.
    const sunnyRight = { sx: 154, sy: 150, sw: 362, sh: 440 };
    const merry = { sx: 892, sy: 138, sw: 418, sh: 467 };
    const WATERLINE = 266;
    // Ships ride a gentle swell: a few pixels of bob and a slight rock, nothing more.
    const drawShip = (c: CanvasRenderingContext2D, ship: typeof merry, x: number, height: number, phase: number) => {
      const width = ship.sw * (height / ship.sh);
      c.save();
      c.translate(x + width / 2, WATERLINE + Math.sin(swell * 1.4 + phase) * 2.5);
      c.rotate(Math.sin(swell * 0.9 + phase) * 0.018);
      c.fillStyle = "rgba(11, 42, 58, 0.25)";
      c.beginPath(); c.ellipse(0, 1, width * 0.42, 4, 0, 0, Math.PI * 2); c.fill();
      c.drawImage(ships, ship.sx, ship.sy, ship.sw, ship.sh, -width / 2, -height, width, height);
      c.strokeStyle = "rgba(255, 255, 255, 0.6)"; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(0, -1, width * 0.36, 2.5, 0, 0, Math.PI); c.stroke();
      c.restore();
    };
    const waveLine = (c: CanvasRenderingContext2D, y: number, amplitude: number, length: number, shift: number, alpha: number, width: number) => {
      c.beginPath();
      for (let x = 0; x <= 1000; x += 8) {
        const yy = y + Math.sin(((x + shift) / length) * Math.PI * 2 + swell * 0.8) * amplitude;
        if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.strokeStyle = `rgba(255, 255, 255, ${alpha})`; c.lineWidth = width; c.stroke();
    };
    let swell = 0;
    // Bottom of grass.jpg (where the blades are) plus a mirrored copy, baked once so the tiled strip
    // has matching edges and no sub-pixel seams. Baked only after decode: Safari can report the
    // image as complete before it has pixels, which would bake a blank strip.
    let ground: HTMLCanvasElement | null = null;
    grass.decode().then(() => {
      const sy = 1180, sh = grass.naturalHeight - sy, tile = Math.round(grass.naturalWidth * (120 / sh));
      const strip = document.createElement("canvas"); strip.width = tile * 2; strip.height = 120;
      const g = strip.getContext("2d")!;
      g.drawImage(grass, 0, sy, grass.naturalWidth, sh, 0, 0, tile, 120);
      g.translate(tile * 2, 0); g.scale(-1, 1);
      g.drawImage(grass, 0, sy, grass.naturalWidth, sh, 0, 0, tile, 120);
      ground = strip;
    }).catch(() => { /* Fall back to the flat green ground. */ });
    let frame = 0;
    let previous = 0;
    const paint = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 0.04) : 0;
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
        r.time += dt; r.spawn -= dt; r.kick = Math.max(0, r.kick - dt); r.cooldown = Math.max(0, r.cooldown - dt); r.jump = Math.max(0, r.jump - dt);
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
          if (!enemy.hit && r.kick > 0.08 && r.kick < 0.36 && enemy.x < r.x + 115 && enemy.x > r.x + 5) {
            enemy.hit = true; r.score += 100;
            playSound("hit");
            if (r.score >= GOAL) { r.won = true; r.over = true; break; }
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
      if (r.won && !blocked.current) r.door = Math.min(1, r.door + dt * 1.4);
      // A win only shows its overlay once the kitchen door has slammed shut.
      const over = r.over && (!r.won || r.door >= 1);
      setHud((old) => old.score === r.score && old.lives === r.lives && old.over === over && old.won === r.won ? old : { score: r.score, lives: r.lives, over, won: r.won });
      const c = context;
      c.fillStyle = "#fdfbf7"; c.fillRect(0, 0, 1000, 420);
      // Sea: deep teal fading to a pale horizon, with the crew's ships riding the swell.
      const wrap = (value: number, span: number) => ((value % span) + span) % span;
      const sea = c.createLinearGradient(0, 222, 0, 300);
      sea.addColorStop(0, "#bfe6ef"); sea.addColorStop(0.35, "#5fb0cc"); sea.addColorStop(1, "#16506e");
      c.fillStyle = sea; c.fillRect(0, 222, 1000, 78);
      const haze = c.createLinearGradient(0, 196, 0, 228);
      haze.addColorStop(0, "rgba(253, 251, 247, 0)"); haze.addColorStop(1, "rgba(191, 230, 239, 0.7)");
      c.fillStyle = haze; c.fillRect(0, 196, 1000, 32);
      // Deeper water toward the shore.
      const depth = c.createLinearGradient(0, WATERLINE - 8, 0, 300);
      depth.addColorStop(0, "rgba(63, 146, 178, 0)"); depth.addColorStop(0.3, "rgba(42, 120, 152, 0.85)"); depth.addColorStop(1, "rgba(22, 80, 110, 1)");
      c.fillStyle = depth; c.fillRect(0, WATERLINE - 8, 1000, 300 - WATERLINE + 8);
      // Wave lines: finer and slower near the horizon, broader up front.
      waveLine(c, 232, 0.6, 70, r.scroll * 0.15, 0.35, 1);
      waveLine(c, 242, 0.9, 95, r.scroll * 0.22 + 30, 0.3, 1);
      waveLine(c, 254, 1.2, 120, r.scroll * 0.3 + 60, 0.28, 1.2);
      waveLine(c, 270, 1.6, 150, r.scroll * 0.4 + 15, 0.3, 1.5);
      waveLine(c, 284, 2, 180, r.scroll * 0.5 + 90, 0.26, 1.8);
      c.strokeStyle = "rgba(11, 42, 58, 0.55)"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 222); c.lineTo(1000, 222); c.stroke();
      // Ships float on top of the water, drawn last. Anchored; they only slide past (slower, farther away) as Sanji walks.
      if (ships.complete && ships.naturalWidth) {
        drawShip(c, sunnyRight, wrap(380 - r.scroll * 0.3, 1300) - 150, 92, 0);
        drawShip(c, merry, wrap(700 - r.scroll * 0.3, 1300) - 150, 112, 2.1);
      }
      if (ground) {
        for (let x = -wrap(Math.round(r.scroll), ground.width); x < 1000; x += ground.width) c.drawImage(ground, x, 300);
      } else { c.fillStyle = "#58962a"; c.fillRect(0, 300, 1000, 120); }
      c.strokeStyle = "#000"; c.lineWidth = 5;
      c.beginPath(); c.moveTo(0, 300); c.lineTo(1000, 300); c.stroke();
      c.fillStyle = "#000"; c.font = "bold 23px sans-serif";
      c.fillText(ja ? "厨房に迷い込んだマリモ軍団！" : "HE GOT LOST. NOW THERE ARE MILLIONS.", 30, 72);
      const lift = r.jump > 0 ? Math.sin((r.jump / 0.85) * Math.PI) * 135 : 0;
      const moving = direction.current !== 0 || r.jump > 0;
      // Standing still uses the upright guard stance that opens the kick sheet.
      const pose = r.kick > 0 ? kicking[Math.min(7, Math.floor((1 - r.kick / 0.48) * 8))] : moving ? running[Math.floor(r.time * 12) % 8] : kicking[0];
      if (pose.complete && pose.naturalWidth) {
        // Same on-screen height as Zoro: Sanji's standing pose is scaled to CHARACTER_HEIGHT.
        const scale = CHARACTER_HEIGHT / Math.max(kicking[0].naturalHeight, 1);
        const width = pose.naturalWidth * scale, height = pose.naturalHeight * scale;
        c.drawImage(pose, r.x - 20, 300 - height - lift, width, height);
      }
      c.fillStyle = "#000"; c.font = "bold 14px sans-serif"; c.fillText("SANJI", r.x - 5, 300 - CHARACTER_HEIGHT - 15 - lift);
      if (r.kick > 0) { c.fillStyle = "#ff6584"; c.font = "bold 22px sans-serif"; c.fillText("KICK!", r.x + 95, 300 - CHARACTER_HEIGHT + 10 - lift); }
      for (const enemy of r.enemies) {
        const zoroPose = enemy.hit ? falling[Math.min(6, Math.floor(enemy.fall * 10))] : walking[Math.floor(r.time * 10) % 7];
        if (zoroPose.complete && zoroPose.naturalWidth) {
          const scale = CHARACTER_HEIGHT / Math.max(...walking.map((image) => image.naturalHeight), 1);
          const width = zoroPose.naturalWidth * scale, height = zoroPose.naturalHeight * scale;
          c.drawImage(zoroPose, enemy.x + 27 - width / 2, 300 - height, width, height);
        }
        if (enemy.hit && enemy.fall < 0.6) { c.fillStyle = "#ff6584"; c.font = "bold 26px sans-serif"; c.fillText("POW!", enemy.x, 145); }
        else if (!enemy.hit) { c.fillStyle = "#000"; c.font = "bold 16px sans-serif"; c.fillText("ZORO", enemy.x + 5, 145); }
      }
      if (r.won) {
        // Sanji's had enough: the kitchen's double doors swing in from both sides and slam shut.
        const t = 1 - Math.pow(1 - r.door, 3), width = 500 * t;
        c.lineWidth = 5; c.strokeStyle = "#000";
        for (const [x, knob] of [[0, width - 30], [1000 - width, 1000 - width + 30]]) {
          c.fillStyle = "#9a6232"; c.fillRect(x, 0, width, 420); c.strokeRect(x, 0, width, 420);
          c.fillStyle = "#00000022";
          for (let plank = x + 60; plank < x + width; plank += 60) c.fillRect(plank, 0, 4, 420);
          c.fillStyle = "#f3c63f"; c.beginPath(); c.arc(knob, 220, 11, 0, Math.PI * 2); c.fill(); c.stroke();
        }
        if (r.door >= 1) {
          c.fillStyle = "#fdfbf7"; c.fillRect(330, 70, 340, 110); c.strokeRect(330, 70, 340, 110);
          c.fillStyle = "#000"; c.textAlign = "center";
          c.font = "bold 30px sans-serif"; c.fillText(ja ? "閉店" : "CLOSED", 500, 115);
          c.font = "bold 18px sans-serif"; c.fillText(ja ? "マリモお断り" : "NO MOSSHEADS ALLOWED", 500, 155);
          c.textAlign = "start";
        } else if (r.door > 0.75) { c.fillStyle = "#ff6584"; c.font = "bold 64px sans-serif"; c.textAlign = "center"; c.fillText("SLAM!", 500, 120); c.textAlign = "start"; }
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [ja]);

  return (
    <section role="dialog" aria-modal="true" aria-labelledby="zoro-game-title" className="fixed inset-0 z-[120] flex flex-col overflow-y-auto bg-parchment">
      {/* Full-width stage; the HUD, meter and controls sit underneath it. */}
      <div className="relative w-full shrink-0">
        <canvas ref={canvas} width={1000} height={420} aria-label={ja ? "サンジが走りながらゾロをキックするゲーム" : "Sanji runner: kick approaching Zoros to earn 100 points each"} className="block h-auto w-full" />
        {(portrait || paused || hud.over || !started) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-parchment/95 p-4 text-center">
            <h3 className="font-display text-4xl">{portrait ? (ja ? "スマホまで迷子か？横向きに！" : "Even your phone got lost. Turn it sideways!") : hud.over && hud.won ? (ja ? "満足だ。厨房の扉は閉めたぜ、マリモ！" : "Sanji is satisfied. Door's shut, mosshead!") : hud.over ? (ja ? "マリモに厨房を乗っ取られた！" : "The mosshead stole your kitchen!") : !started ? (ja ? "マリモ退治の準備はいいか？" : "Ready to mow the mosshead?") : (ja ? "一時停止" : "Paused")}</h3>
            <p>{portrait ? (ja ? "モバイルでは横画面でのみプレイできます。" : "Mobile play requires landscape. Your run is paused until you rotate.") : !started ? (ja ? "開始するまでゾロは待機中。" : "The mossheads can wait. Start when you’re ready.") : `${ja ? "得点" : "Points"}: ${hud.score}`}</p>
            {!started && !portrait && <button disabled={!ready} onClick={restart} className="border-4 border-black bg-mellow px-6 py-3 font-display text-3xl disabled:opacity-50">{!ready ? (ja ? "読み込み中…" : "Loading frames…") : mobileControls ? (ja ? "タップして開始" : "Tap to start") : (ja ? "クリックして開始" : "Click to start")}</button>}
            {hud.over && !portrait && <button onClick={restart} className="border-4 border-black bg-rose px-6 py-2 font-display text-2xl">{hud.won ? (ja ? "もう一度厨房を守る" : "Guard the kitchen again") : (ja ? "もう一度蹴っ飛ばす" : "Rematch, mosshead!")}</button>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3 sm:px-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="zoro-game-title" className="font-display text-3xl sm:text-4xl">{ja ? "マリモを蹴っ飛ばせ！" : "Beat the Mosshead!"}</h2>
          <p className="font-bold">{ja ? "得点" : "Points"}: {hud.score} · {ja ? "ライフ" : "Lives"}: {hud.lives} · {ja ? "最高" : "Best"}: {best}</p>
          <button ref={closeButton} onClick={onClose} className="border-2 border-black px-3 py-1 font-bold">{ja ? "戻る" : "Back"}</button>
        </header>
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-sm font-bold">{ja ? "サンジ満足度" : "Sanji's satisfaction"}</span>
          <div role="progressbar" aria-label={ja ? "サンジ満足度" : "Sanji's satisfaction"} aria-valuemin={0} aria-valuemax={GOAL} aria-valuenow={Math.min(hud.score, GOAL)} className="relative h-6 flex-1 overflow-hidden border-4 border-black bg-white">
            <div className="h-full bg-rose transition-[width] duration-300 ease-out" style={{ width: `${Math.min(hud.score / GOAL, 1) * 100}%` }} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{Math.min(hud.score, GOAL)} / {GOAL}{hud.won ? " ♡" : ""}</span>
          </div>
        </div>
        {!mobileControls && <p className="text-right text-sm font-bold">{ja ? "K：キック · J：ジャンプ · ← →：走る" : "K to kick · J to jump · ← → to run"}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm">{ja ? "1体100点！" : "100 points per Zoro!"}<br />{ja ? "近づいたらキック、ジャンプで回避！迷子なのに厨房には来やがる。" : "Kick when close. Jump to dodge. He can’t find the exit, but he found your kitchen."}</p>
          {mobileControls && <div className="flex shrink-0 gap-2">
            {([-1, 1] as const).map((value) => <button key={value} aria-label={value < 0 ? "Run left" : "Run right"} disabled={portrait || hud.over || !started} onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); direction.current = value; }} onPointerUp={() => { direction.current = 0; }} onPointerCancel={() => { direction.current = 0; }} onLostPointerCapture={() => { direction.current = 0; }} className="touch-none border-4 border-black bg-white px-3 py-2 font-display text-2xl disabled:opacity-40">{value < 0 ? "←" : "→"}</button>)}
            <button disabled={portrait || hud.over || !started} onPointerDown={(e) => { e.preventDefault(); jump(); }} onClick={(e) => { if (e.detail === 0) jump(); }} className="touch-none border-4 border-black bg-mellow px-3 py-2 font-display text-2xl disabled:opacity-40">{ja ? "ジャンプ" : "Jump"}</button>
            <button disabled={portrait || hud.over || !started} onPointerDown={(e) => { e.preventDefault(); kick(); }} onClick={(e) => { if (e.detail === 0) kick(); }} className="touch-none border-4 border-black bg-rose px-3 py-2 font-display text-2xl disabled:opacity-40">{ja ? "キック" : "Kick"}</button>
          </div>}
        </div>
      </div>
    </section>
  );
}
