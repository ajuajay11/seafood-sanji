"use client";

import Link from "next/link";
import { recipes } from "./recipes-data";
import Image, { getImageProps } from "next/image";
import ZoroGame from "./zoro-game";
import MusicToggle from "./music-toggle";
import { playSound } from "./sound-events";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useAnimationControls,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

/* ─────────────────────────── Translation dictionary ─────────────────────────── */

const translations = {
  en: {
    promptName: "State your name, traveler:",
    promptGender: "Select your gender identity:",
    btnMale: "Male",
    btnFemale: "Female",
    btnOther: "Other",
    btnSubmit: "Enter Kitchen",
    zoroAngry:
      "Like hell I would ever cook a single grain of rice for a moss-headed idiot like you! Get out of my sight, Roronoa!",
    zoroCall: "Hurry! Let's stop the mosshead — click here!",
    maleDenied: "MEN ACCESS DENIED! CLOROX THE FLOORS! GET OUT OF MY KITCHEN!",
    otherDenied: "DOORS SHUT! THIS LOVE-STRUCK COOK ONLY HAS EYES FOR THE LADIES TODAY!",
    femaleWelcome:
      "~~~~♡ Ah! {name}-swan! Welcome to my culinary paradise! Let me personally escort you to our table! ♡~~~~",
    menuWelcome:
      "Welcome back, {name}-san... I am waiting for you forever right here in this kitchen! ♡",
    ingredients: "Ingredients of Adventure",
    instructions: "Culinary Instructions",
    recipeNote: "Simplified fan recipes inspired by the story—not official One Piece recipes.",
    backstory: "Log Pose Backstory",
    langToggle: "JA",
    humorNote:
      "Made for laughs! This site is a playful parody inspired by Sanji. Its jokes and character reactions are for entertainment only, with no intent to offend or harm anyone.",
  },
  ja: {
    promptName: "旅人よ、名を名乗れ：",
    promptGender: "性別を選択してください：",
    btnMale: "男",
    btnFemale: "女",
    btnOther: "その他",
    btnSubmit: "厨房に入る",
    zoroAngry:
      "てめェのようなマリモ野郎に、米一粒でも食わせるか！俺の目の前から消え失せろ、ロロノア！",
    zoroCall: "急げ！マリモ頭を止めるぞ — ここをクリック！",
    maleDenied: "野郎は立ち入り禁止だ！床を消毒しろ！俺の厨房から叩き出せ！",
    otherDenied: "扉は閉めた！今日の恋するコックはレディしか目に入らねェ！",
    femaleWelcome:
      "~~~~♡ あぁ！{name}すわ〜ん！我が料理の楽園へようこそ！私がエスコートいたします！ ♡~~~~",
    menuWelcome:
      "おかえりなさい、{name}さん… 私はこの厨房で、貴方をずっとずっと待っています！ ♡",
    ingredients: "冒険の食材",
    instructions: "調理手順",
    recipeNote: "物語に着想を得た簡単なファンレシピです。ONE PIECEの公式レシピではありません。",
    backstory: "ログポースの背景",
    langToggle: "EN",
    humorNote:
      "笑って楽しむためのサイトです！サンジに着想を得た遊び心のあるパロディで、ジョークやキャラクターの反応は娯楽のためのものです。誰かを傷つけたり、不快にさせたりする意図はありません。",
  },
};

type Lang = keyof typeof translations;
type Dictionary = (typeof translations)[Lang];

/* ────────────────────────────────── Assets ─────────────────────────────────── */

/** The intro, in order. It plays once and rests on the last frame. */
const SEQUENCE = [
  "/images/sanji_sequence_01.webp",
  "/images/sanji_sequence_02_1.webp",
  "/images/sanji_sequence_02_2.webp",
  "/images/sanji_sequence_03.webp",
  "/images/sanji_sequence_04.webp",
  "/images/sanji_sequence_05.webp",
  "/images/sanji_sequence_08.webp",
  "/images/sanji_sequence_10.webp",
];
const SEQUENCE_SECONDS = 1.8;
const LAST_FRAME = SEQUENCE.length - 1;

type Mood = "idle" | "zoro" | "female" | "other";

const PORTRAITS: Record<Mood, { src: string; alt: string }> = {
  idle: {
    src: "/images/sanji_sequence_10.webp",
    alt: "Seafood Sanji presenting a fresh seafood casserole in his sea kitchen",
  },
  zoro: { src: "/images/sanji_face_fire_angry.webp", alt: "Sanji, furious, framed by flames" },
  female: {
    src: "/images/sanji_face_lovestruck_portrait.webp",
    alt: "Sanji, lovestruck, with a heart in his eye",
  },
  other: { src: "/images/sanji_face_flirt_nosebleed.webp", alt: "Sanji, smitten, with a nosebleed" },
};

// A Zoro name gets the angry clip instead of the still: a 1 s, 12 fps shot played once in slow
// motion, then held on its last frame. The fire still above stays as its poster and as the
// reduced-motion fallback.
const ANGRY_VIDEO = "/frames/angrysanji.mp4";
const ANGRY_PLAYBACK_RATE = 0.4;

function AngryClip({ alt }: { alt: string }) {
  const video = useRef<HTMLVideoElement>(null);
  // Browsers reset playbackRate whenever media loads, so set both rates before playing.
  const slowDown = () => {
    if (!video.current) return;
    video.current.defaultPlaybackRate = ANGRY_PLAYBACK_RATE;
    video.current.playbackRate = ANGRY_PLAYBACK_RATE;
  };
  useEffect(slowDown, []);
  return (
    <video
      ref={video}
      src={ANGRY_VIDEO}
      poster={PORTRAITS.zoro.src}
      aria-label={alt}
      autoPlay
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={slowDown}
      onPlay={slowDown}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/* Decorative sound effect for the door, drawn the way each language's comics write it. */
const SLAM_SFX: Record<Lang, string> = { en: "SLAM!!", ja: "バタン！！" };

const HEART_COLORS = ["#FF6584", "#FF8FAB", "#FF3D6E", "#FFC2D1"];

/* ───────────────────── Guest session: sessionStorage, up to 24 hours ───────────────────── */

const GUEST_KEY = "sanji-sea-kitchen:guest";
const DAY_MS = 24 * 60 * 60 * 1000;

type Guest = { name: string; savedAt: number };

function saveGuest(name: string): Guest {
  const guest = { name, savedAt: Date.now() };
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  } catch {
    // Private mode or storage switched off: the visit just isn't remembered.
  }
  return guest;
}

/** The remembered guest, or null. An entry 24 hours old or more is wiped on read. */
function readGuest(): Guest | null {
  try {
    const raw = sessionStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const guest = JSON.parse(raw) as Partial<Guest> | null;
    if (
      guest &&
      typeof guest.name === "string" &&
      typeof guest.savedAt === "number" &&
      Date.now() - guest.savedAt < DAY_MS
    ) {
      return { name: guest.name, savedAt: guest.savedAt };
    }
    sessionStorage.removeItem(GUEST_KEY);
    return null;
  } catch {
    return null;
  }
}

function clearGuest() {
  try {
    sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Nothing to clear.
  }
}

/* ──────────────────────────────── Utilities ──────────────────────────────── */

const withName = (line: string, name: string) => line.replaceAll("{name}", name);

/** Fetches and decodes each image up front, so a swap never shows an empty frame. */
const HERO_SIZES = "(min-width: 1152px) 1092px, (min-width: 640px) calc(100vw - 60px), calc(100vw - 44px)";
const PORTRAIT_SIZES = "(min-width: 896px) 368px, (min-width: 768px) calc((100vw - 44px) * 5 / 12), calc(100vw - 44px)";

function preloadImages(sources: string[], sizes: string) {
  return Promise.all(
    sources.map((src) => {
      const image = new window.Image();
      const { props } = getImageProps({ src, alt: "", fill: true, sizes });
      image.sizes = props.sizes ?? sizes;
      image.srcset = props.srcSet ?? "";
      image.src = props.src;
      return image.decode().catch(() => undefined);
    }),
  );
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Heart = {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
};

function makeHearts(count = 28): Heart[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: Math.random() * 100,
    size: 18 + Math.random() * 40,
    delay: Math.random() * 0.9,
    duration: 2.2 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 80,
    color: HEART_COLORS[id % HEART_COLORS.length],
  }));
}

/* ─────────────────────────────── State machine ─────────────────────────────── */

type Phase = "loading" | "sequence" | "dialogue" | "welcome" | "denied" | "menu";
type Gender = "male" | "female" | "other";

export default function SanjiSeaKitchen() {
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("loading");
  // Which choice slammed the door, so the lock screen shows the matching line.
  const [deniedGender, setDeniedGender] = useState<"male" | "other">("male");
  const [frame, setFrame] = useState(0);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [zoroMusic, setZoroMusic] = useState(false);
  const [traveller, setTraveller] = useState(0);
  const t = translations[lang];
  const toggleLang = () => setLang((current) => (current === "en" ? "ja" : "en"));
  const newTraveller = () => {
    clearGuest();
    setGuest(null);
    setZoroMusic(false);
    setTraveller((current) => current + 1);
    setPhase("dialogue");
  };

  // The document language follows the toggle, for screen readers and font fallback.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // STATE 1 — preload every frame, play the sequence exactly once (~1.8s) and
  // settle on frame 10. A guest still inside their 24 hours goes straight to the menu.
  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | undefined;

    const settle = () => {
      setFrame(LAST_FRAME);
      const stored = readGuest();
      setGuest(stored);
      setPhase(stored ? "menu" : "dialogue");
    };

    preloadImages(SEQUENCE, HERO_SIZES).then(() => {
      if (cancelled) return;
      if (prefersReducedMotion()) {
        settle();
        return;
      }
      setPhase("sequence");
      controls = animate(0, SEQUENCE.length, {
        duration: SEQUENCE_SECONDS,
        ease: "linear",
        onUpdate: (value) => setFrame(Math.min(LAST_FRAME, Math.floor(value))),
        onComplete: settle,
      });
    });

    // The faces the dialogue can switch to, warmed while the intro plays.
    preloadImages(Object.values(PORTRAITS).map((portrait) => portrait.src), PORTRAIT_SIZES);

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  // STATE 3, female — the hearts fly, then the recipe board opens.
  useEffect(() => {
    if (phase !== "welcome") return;
    const timer = window.setTimeout(() => setPhase("menu"), 2800);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // A board left open past the 24 hours wipes the guest and asks again.
  useEffect(() => {
    if (phase !== "menu" || !guest) return;
    const timer = window.setTimeout(
      () => {
        clearGuest();
        setGuest(null);
        setPhase("dialogue");
      },
      Math.max(0, guest.savedAt + DAY_MS - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [phase, guest]);

  // While an overlay owns the screen, the page behind it doesn't scroll.
  const overlay = phase === "dialogue" || phase === "welcome" || phase === "denied";
  useEffect(() => {
    document.documentElement.style.overflow = overlay ? "hidden" : "";
  }, [overlay]);

  // Pin the disclaimer from the first paint through the intro and overlays, so
  // finishing the intro doesn't move it from document flow into the viewport.
  const pinnedFooter = phase !== "menu";
  // Publish the pinned footer's
  // height as --footer-h so the dialog can pad its scroll area and never hide content behind it
  // (on phones the footer wraps to several lines).
  const footer = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = footer.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--footer-h", `${pinnedFooter ? element.offsetHeight : 0}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => { observer.disconnect(); root.style.removeProperty("--footer-h"); };
  }, [pinnedFooter]);

  return (
    <MotionConfig reducedMotion="user">
      <MusicToggle angry={zoroMusic} lang={lang} />
      {guest && (
        <button
          type="button"
          onClick={newTraveller}
          title={lang === "ja" ? "ゲスト情報を消去して、新しい名前を入力" : "Clear the guest session and enter a new name"}
          className="fixed top-2 right-2 z-[130] border-2 border-black bg-mellow px-3 py-1 text-xs font-bold shadow-[3px_3px_0_#000]"
        >
          {lang === "ja" ? "新しい旅人" : "New Traveller"}
        </button>
      )}
      <main className="halftone relative min-h-dvh overflow-x-clip">
        {phase === "menu" && guest ? (
          <RecipeBoard t={t} lang={lang} guest={guest} onToggleLang={toggleLang} />
        ) : (
          <HeroStage frame={frame} loading={phase === "loading"} />
        )}

        <section
          aria-labelledby="journey-title"
          className="mx-auto w-full max-w-6xl px-4 pt-8 pb-[calc(var(--footer-h,0px)+3rem)] sm:px-6"
        >
          <div className="space-y-4 border-4 border-black bg-parchment p-5 shadow-[6px_6px_0_#000] sm:p-8">
            <h2 id="journey-title" className="font-display text-3xl sm:text-4xl">
              {lang === "ja" ? "サンジの海鮮レシピと料理の旅" : "Sanji seafood recipes & a manga culinary journey"}
            </h2>
            <p>
              {lang === "ja"
                ? "『ワンピース』に着想を得た海のキッチンへようこそ。サンジ風の海鮮リゾットや焼き魚をはじめ、蕎麦、ピザ、スープ、ケーキなど、7つのファンレシピを材料や作り方とともに楽しめます。"
                : "Welcome to a One Piece-inspired seafood kitchen. Explore Sanji seafood dishes such as Gin's Seafood Risotto and Skypiea Grilled Sky Fish, alongside soba, pizza, soup and celebration cake. Each of the seven fan recipes includes ingredients, cooking steps and story context."}
            </p>
            <h3 className="font-display text-2xl">
              {lang === "ja" ? "インタラクティブな漫画のキッチンを楽しもう" : "Explore the interactive manga food adventure"}
            </h3>
            <p>
              {lang === "ja"
                ? "アニメーションとキャラクターのリアクションを楽しみながら、英語・日本語の会話を切り替えて料理の旅を進めましょう。非公式のファンパロディであり、料理は家庭向けのアレンジです。"
                : "Follow Sanji's culinary journey through animated scenes, playful character reactions and English or Japanese dialogue. This interactive manga cooking adventure is an unofficial fan parody, and the recipes are home-kitchen interpretations of dishes from the story."}
            </p>
            <Link href="/recipes" className="inline-block font-bold underline underline-offset-4">
              {lang === "ja" ? "7つのレシピ・材料・作り方を見る" : "Browse all seven Sanji-inspired recipes, ingredients & cooking methods"}
            </Link>
          </div>
        </section>

        <AnimatePresence>
          {(phase === "dialogue" || phase === "welcome") && (
            <DialogueModal
              key={`dialogue-${traveller}`}
              t={t}
              lang={lang}
              welcoming={phase === "welcome"}
              onToggleLang={toggleLang}
              onDenied={(denied) => {
                setZoroMusic(false);
                setDeniedGender(denied);
                setPhase("denied");
              }}
              onZoro={() => setZoroMusic(true)}
              onWelcomed={(name) => {
                setZoroMusic(false);
                setGuest(saveGuest(name));
                setPhase("welcome");
              }}
            />
          )}
        </AnimatePresence>

        {phase === "denied" && <LockScreen t={t} lang={lang} gender={deniedGender} />}
      </main>
      <footer
        ref={footer}
        className={`border-t-2 border-black bg-parchment px-4 py-3 text-center text-xs leading-relaxed sm:text-sm ${
          pinnedFooter ? "fixed inset-x-0 bottom-0 z-[110]" : "relative"
        }`}
      >
        <p className="mx-auto max-w-3xl">{t.humorNote}</p>
        <Link href="/recipes" className="mt-1 inline-block font-bold underline underline-offset-2">
          {lang === "ja" ? "レシピとよくある質問" : "Browse recipes & frequently asked questions"}
        </Link>
      </footer>
    </MotionConfig>
  );
}

/* ─────────────────────────────── Shared pieces ─────────────────────────────── */

function Masthead({ compact = false }: { compact?: boolean }) {
  return (
    <header className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <h1
        className={`font-display leading-[0.9] tracking-wide text-mellow drop-shadow-[5px_5px_0_#000] [-webkit-text-stroke:3px_#000] [paint-order:stroke_fill] ${
          compact ? "text-[clamp(2rem,5vw,3.5rem)]" : "text-[clamp(2.75rem,8vw,6rem)]"
        }`}
      >
        Sanji&apos;s Sea Kitchen
      </h1>
      <p className="-rotate-2 border-4 border-black bg-rose px-3 py-1 font-display text-[clamp(1rem,2.2vw,1.5rem)] tracking-wide text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        Interactive Manga Culinary Journey
      </p>
    </header>
  );
}

/** EN / JA switch. The inactive half shows the dictionary's `langToggle` label. */
function LangToggle({
  lang,
  label,
  onToggle,
}: {
  lang: Lang;
  label: string;
  onToggle: () => void;
}) {
  const ja = lang === "ja";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ja}
      aria-label="English / 日本語"
      onClick={onToggle}
      className="relative grid h-11 w-28 grid-cols-2 items-center border-4 border-black bg-white font-display text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-x-0.5 active:translate-y-0.5"
    >
      <motion.span
        aria-hidden
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={`absolute inset-y-0 w-1/2 border-black bg-mellow ${ja ? "right-0 border-l-4" : "left-0 border-r-4"}`}
      />
      <span className={`relative text-center ${ja ? "text-black/40" : ""}`}>{ja ? label : "EN"}</span>
      <span className={`relative text-center ${ja ? "" : "text-black/40"}`}>{ja ? "JA" : label}</span>
    </button>
  );
}

/* ───────────────────────── STATE 1: the hero sequence ───────────────────────── */

function HeroStage({ frame, loading }: { frame: number; loading: boolean }) {
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center gap-6 px-4 py-8 sm:px-6">
      <Masthead />
      <div className="relative aspect-video w-full overflow-hidden border-[6px] border-black bg-[#f0d6b4] shadow-[8px_8px_0px_0px_#F3C63F]">
        {/* Every frame is stacked and decoded; only the current one is shown. */}
        {SEQUENCE.map((src, index) => (
          <Image
            key={src}
            src={src}
            alt={index === LAST_FRAME ? PORTRAITS.idle.alt : ""}
            aria-hidden={index !== frame}
            fill
            sizes={HERO_SIZES}
            preload={index === 0}
            loading={index === 0 ? undefined : "eager"}
            className={`object-cover ${index === frame ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        {loading && (
          <div
            role="status"
            className="absolute bottom-4 left-4 flex items-center gap-2 border-4 border-black bg-white px-4 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
          >
            <span className="sr-only">Loading</span>
            {[0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                aria-hidden
                className="size-2.5 rounded-full bg-black"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: dot * 0.15 }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ──────────────────── STATES 2 & 3: the dialogue and its branches ──────────────────── */

function DialogueModal({
  t,
  lang,
  welcoming,
  onToggleLang,
  onDenied,
  onZoro,
  onWelcomed,
}: {
  t: Dictionary;
  lang: Lang;
  welcoming: boolean;
  onToggleLang: () => void;
  onDenied: (gender: "male" | "other") => void;
  onZoro: () => void;
  onWelcomed: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [playing, setPlaying] = useState(false);
  const panel = useAnimationControls();
  const input = useRef<HTMLInputElement>(null);

  // Pop in once mounted, and put the cursor in the name field.
  useEffect(() => {
    panel.start("rest");
    input.current?.focus();
  }, [panel]);

  const trimmed = name.trim();
  const ready = trimmed.length > 0 && gender !== null && !welcoming;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || !gender) return;

    // OTHER: whatever the name (even a Zoro), the doors slam shut with a "katcha!" and stay locked.
    if (gender === "other") {
      onDenied("other");
      return;
    }

    // THE ZORO EASTER EGG: intercepted before the male and female branches.
    if (trimmed.toLowerCase().includes("zor")) {
      onZoro();
      setMood("zoro");
      panel.start("shake");
      return;
    }

    // THE MALE BRANCH: the kitchen locks, and nothing on screen undoes it.
    if (gender === "male") {
      onDenied("male");
      return;
    }

    // FEMALE: hearts, a new face, and the name remembered for this tab session (up to 24 hours).
    const lowerName = trimmed.toLowerCase();
    if (lowerName.includes("nami")) playSound("nami");
    else if (lowerName.includes("robin")) playSound("robin");
    else if (gender === "female") playSound("girl");
    setMood(gender);
    setHearts(makeHearts());
    onWelcomed(trimmed);
  };

  const portrait = PORTRAITS[mood];
  const reducedMotion = useReducedMotion();
  const genders: { value: Gender; label: string }[] = [
    { value: "male", label: t.btnMale },
    { value: "female", label: t.btnFemale },
    { value: "other", label: t.btnOther },
  ];

  // Leaving the game (Back, or Escape) reloads the page for a fresh start from the homepage.
  if (playing) return <ZoroGame lang={lang} onClose={() => window.location.reload()} />;

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex min-h-full items-center justify-center p-4 pt-12 pb-[calc(var(--footer-h,0px)+1rem)] sm:p-8 sm:pb-[calc(var(--footer-h,0px)+2rem)]">
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-name-label"
          initial="enter"
          animate={panel}
          variants={{
            enter: { opacity: 0, y: 48, scale: 0.9, rotate: -2 },
            rest: {
              opacity: 1,
              y: 0,
              scale: 1,
              rotate: 0,
              transition: { type: "spring", stiffness: 260, damping: 22 },
            },
            shake: {
              x: [0, -28, 26, -20, 16, -10, 6, 0],
              rotate: [0, -3, 3, -2, 1.5, -1, 0.5, 0],
              transition: { duration: 0.6, ease: "easeInOut" },
            },
          }}
          className="relative w-full max-w-4xl border-[6px] border-black bg-parchment shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        >
          {/* Floating top-right, half over the panel's frame. */}
          <div className="absolute -top-6 right-4 z-10">
            <LangToggle lang={lang} label={t.langToggle} onToggle={onToggleLang} />
          </div>

          <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="relative aspect-[16/10] overflow-hidden border-b-[6px] border-black bg-mellow md:aspect-auto md:min-h-[28rem] md:border-r-[6px] md:border-b-0">
              <AnimatePresence initial={false}>
                <motion.div
                  key={portrait.src}
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 1.12 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  {mood === "zoro" && !reducedMotion ? (
                    <AngryClip alt={portrait.alt} />
                  ) : (
                    <Image
                      src={portrait.src}
                      alt={portrait.alt}
                      fill
                      sizes={PORTRAIT_SIZES}
                      loading="eager"
                      className="object-cover"
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex flex-col p-5 sm:p-8">
              <AnimatePresence mode="wait">
                {mood !== "idle" && (
                  <Speech key={mood} tone={mood === "zoro" ? "shout" : "love"}>
                    {mood === "zoro" ? t.zoroAngry : withName(t.femaleWelcome, trimmed)}
                  </Speech>
                )}
              </AnimatePresence>

              {mood === "zoro" && (
                <div className="mb-6">
                  {/* A shouted call to action pointing down at the game button. */}
                  <p id="zoro-call" className="mb-2 flex items-center gap-2 font-display text-xl tracking-wide text-rose sm:text-2xl">
                    {t.zoroCall}
                    <span aria-hidden="true" className="inline-block motion-safe:animate-bounce">↓</span>
                  </p>
                  <button
                    type="button"
                    aria-describedby="zoro-call"
                    onClick={() => setPlaying(true)}
                    className="w-full border-4 border-black bg-mellow px-5 py-3 font-display text-3xl shadow-[4px_4px_0_#000] hover:bg-rose"
                  >
                    {lang === "ja" ? "マリモを蹴っ飛ばせ！" : "Beat the Mosshead!"}
                  </button>
                </div>
              )}

              <form onSubmit={submit} noValidate>
                <fieldset disabled={welcoming} className="flex flex-col gap-6">
                  <div>
                    <label
                      id="guest-name-label"
                      htmlFor="guest-name"
                      className="font-display text-[1.6rem] leading-tight tracking-wide"
                    >
                      {t.promptName}
                    </label>
                    <input
                      ref={input}
                      id="guest-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={40}
                      autoComplete="nickname"
                      spellCheck={false}
                      className="mt-2 w-full border-4 border-black bg-white px-4 py-3 text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none transition-shadow focus:shadow-[4px_4px_0px_0px_#F3C63F]"
                    />
                  </div>

                  <fieldset>
                    <legend className="font-display text-[1.6rem] leading-tight tracking-wide">
                      {t.promptGender}
                    </legend>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      {genders.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={gender === option.value}
                          onClick={() => setGender(option.value)}
                          className="border-4 border-black bg-white px-2 py-3 font-display text-xl tracking-wide shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition hover:-translate-y-0.5 aria-pressed:-translate-x-0.5 aria-pressed:-translate-y-0.5 aria-pressed:bg-mellow aria-pressed:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <button
                    type="submit"
                    disabled={!ready}
                    className="border-4 border-black bg-rose px-6 py-3 font-display text-3xl tracking-wide text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition enabled:hover:-translate-y-0.5 enabled:active:translate-x-1 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t.btnSubmit}
                  </button>
                </fieldset>
              </form>
            </div>
          </div>
        </motion.section>
      </div>

      <HeartCascade hearts={hearts} />
    </motion.div>
  );
}

function Speech({ tone, children }: { tone: "shout" | "love"; children: ReactNode }) {
  const shout = tone === "shout";
  return (
    <motion.p
      role={shout ? "alert" : "status"}
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className={`relative mb-7 border-4 border-black p-4 text-[1.05rem] leading-snug font-bold shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] ${
        shout ? "-rotate-1 bg-black text-mellow" : "rotate-1 bg-rose text-white"
      }`}
    >
      {children}
      <span
        aria-hidden
        className={`absolute -bottom-3 left-8 size-5 rotate-45 border-r-4 border-b-4 border-black ${shout ? "bg-black" : "bg-rose"}`}
      />
    </motion.p>
  );
}

function HeartCascade({ hearts }: { hearts: Heart[] }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {hearts.map((heart) => (
        <motion.svg
          key={heart.id}
          viewBox="0 0 24 24"
          width={heart.size}
          height={heart.size}
          className="absolute -bottom-16"
          style={{ left: `${heart.left}%` }}
          initial={{ y: 0, x: 0, opacity: 0, rotate: 0, scale: 0.6 }}
          animate={{ y: "-115vh", x: heart.drift, opacity: [0, 1, 1, 0], rotate: heart.spin, scale: 1 }}
          transition={{ duration: heart.duration, delay: heart.delay, ease: "easeOut" }}
        >
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill={heart.color}
            stroke="#000"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </motion.svg>
      ))}
    </div>
  );
}

/* ─────────────────────── STATE 3, male branch: the hard lock ─────────────────────── */

function LockScreen({ t, lang, gender }: { t: Dictionary; lang: Lang; gender: "male" | "other" }) {
  const slam = { delay: 0.12, duration: 0.3, ease: [0.55, 0, 1, 0.45] as const };

  // "Katcha!": for Other, the latch clicks the moment the two doors meet (slam delay + duration).
  useEffect(() => {
    if (gender !== "other") return;
    const timer = window.setTimeout(() => playSound("katcha"), (slam.delay + slam.duration) * 1000);
    return () => window.clearTimeout(timer);
  }, [gender, slam.delay, slam.duration]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="locked-message"
      className="cut-to-black fixed inset-0 z-[100] overflow-hidden bg-black"
    >
      {/* The whole frame jolts the moment the doors meet. */}
      <motion.div
        className="absolute inset-0"
        animate={{ x: [0, -16, 14, -9, 6, 0], y: [0, 7, -6, 3, 0] }}
        transition={{ delay: 0.42, duration: 0.35 }}
      >
        <motion.div
          aria-hidden
          className="wood absolute inset-y-0 left-0 w-1/2 border-r-[6px] border-black"
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={slam}
        >
          <DoorHardware side="left" />
        </motion.div>
        <motion.div
          aria-hidden
          className="wood absolute inset-y-0 right-0 w-1/2 border-l-[6px] border-black"
          initial={{ x: "100%" }}
          animate={{ x: "0%" }}
          transition={slam}
        >
          <DoorHardware side="right" />
        </motion.div>

        <motion.p
          aria-hidden
          className="absolute top-[10%] left-1/2 -translate-x-1/2 font-display text-[clamp(3rem,12vw,9rem)] leading-none whitespace-nowrap text-mellow [-webkit-text-stroke:4px_#000] [paint-order:stroke_fill]"
          initial={{ opacity: 0, scale: 2.4, rotate: -12 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [2.4, 1, 1, 1.1], rotate: -8 }}
          transition={{ delay: 0.42, duration: 1.1, times: [0, 0.15, 0.75, 1] }}
        >
          {SLAM_SFX[lang]}
        </motion.p>

        <div className="absolute inset-0 grid place-items-center p-6 pb-[calc(var(--footer-h,0px)+1.5rem)]">
          <motion.div
            initial={{ opacity: 0, scale: 0.4, rotate: 6 }}
            animate={{ opacity: 1, scale: 1, rotate: -2 }}
            transition={{ delay: 0.75, type: "spring", stiffness: 320, damping: 18 }}
            className="max-w-2xl border-[6px] border-black bg-mellow px-6 py-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:px-10"
          >
            <Padlock className="mx-auto mb-4 size-16" />
            <p
              id="locked-message"
              className="font-display text-[clamp(2rem,6vw,3.75rem)] leading-[0.95] tracking-wide"
            >
              {gender === "other" ? t.otherDenied : t.maleDenied}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function DoorHardware({ side }: { side: "left" | "right" }) {
  const outer = side === "left" ? "left-0" : "right-0";
  const inner = side === "left" ? "right-6" : "left-6";
  return (
    <>
      {/* Iron straps across the planks */}
      <span className={`absolute top-[12%] ${outer} h-6 w-[70%] border-y-4 border-black bg-[#2b2b2b]`} />
      <span className={`absolute bottom-[12%] ${outer} h-6 w-[70%] border-y-4 border-black bg-[#2b2b2b]`} />
      {/* Brass handle by the seam */}
      <span
        className={`absolute top-1/2 ${inner} h-28 w-4 -translate-y-1/2 rounded-full border-4 border-black bg-[#c9a227]`}
      />
    </>
  );
}

function Padlock({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={className}>
      <path d="M18 29v-9a14 14 0 0 1 28 0v9" fill="none" stroke="#000" strokeWidth={7} strokeLinecap="round" />
      <rect x="9" y="28" width="46" height="31" rx="4" fill="#FF6584" stroke="#000" strokeWidth={5} />
      <circle cx="32" cy="41" r="4.5" fill="#000" />
      <path d="M32 44v7" stroke="#000" strokeWidth={5} strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────── STATE 4: the static recipe board ─────────────────────── */

function RecipeBoard({
  t,
  lang,
  guest,
  onToggleLang,
}: {
  t: Dictionary;
  lang: Lang;
  guest: Guest;
  onToggleLang: () => void;
}) {
  const [selectedId, setSelectedId] = useState(recipes[0].id);
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0];
  const ja = lang === "ja";

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 sm:px-6 sm:pt-12 lg:py-12"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Masthead compact />
        <LangToggle lang={lang} label={t.langToggle} onToggle={onToggleLang} />
      </div>

      {/* Greeting banner, with the name pulled from sessionStorage */}
      <p className="mb-5 text-sm leading-relaxed text-black/70">{t.recipeNote}</p>
      <div className="mb-8 flex items-center gap-3 border-4 border-black bg-mellow p-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:mb-10 sm:gap-6 sm:border-[6px] sm:p-6 sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-full border-4 border-black bg-rose sm:size-28">
          <Image
            src={PORTRAITS.female.src}
            alt=""
            fill
            sizes="(min-width: 640px) 104px, 48px"
            loading="eager"
            className="object-cover object-top"
          />
        </div>
        <p className="font-display text-[clamp(1.35rem,3vw,2.35rem)] leading-tight tracking-wide">
          {withName(t.menuWelcome, guest.name)}
        </p>
      </div>

      {/* Desktop: an asymmetric manga page, a narrow column of dishes beside a wide preview panel.
          Phones and tablets: the dishes become a swipeable strip of tickets right above the preview,
          so picking one never pushes the recipe a screen away. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-8">
        <div className="min-w-0">
          <p aria-hidden className="mb-1 text-right text-xs font-bold tracking-wide text-black/60 lg:hidden">
            {ja ? "スワイプで料理を選ぶ →" : "Swipe for more dishes →"}
          </p>
        <ul className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-2 pb-5 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:snap-none lg:gap-5 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden">
          {recipes.map((recipe, index) => {
            const active = recipe.id === selected.id;
            return (
              <li key={recipe.id} className="w-[min(15rem,70vw)] shrink-0 snap-start lg:w-auto">
                <button
                  type="button"
                  aria-pressed={active}
                  aria-controls="recipe-preview"
                  onClick={(event) => {
                    setSelectedId(recipe.id);
                    // Slide a half-hidden ticket to the start of the strip; scrolls only the strip, never the page.
                    const ticket = event.currentTarget.parentElement, strip = ticket?.parentElement;
                    if (ticket && strip && strip.scrollWidth > strip.clientWidth) {
                      strip.scrollTo({ left: ticket.offsetLeft - parseFloat(getComputedStyle(strip).scrollPaddingLeft || "0"), behavior: "smooth" });
                    }
                  }}
                  className={`block h-full w-full border-4 border-black p-3 text-left transition duration-200 lg:p-5 ${
                    index % 2 ? "rotate-1" : "-rotate-1"
                  } ${
                    active
                      ? "-translate-y-1 bg-mellow shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] lg:-translate-x-1 lg:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]"
                      : "bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:bg-parchment lg:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
                  }`}
                >
                  <span className="font-display text-base tracking-widest text-rose lg:text-lg">
                    No.{String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-1 block font-display text-[1.35rem] leading-none tracking-wide lg:text-[1.9rem]">
                    {ja ? recipe.titleJa : recipe.titleEn}
                  </span>
                  <span className="mt-1.5 block text-xs text-black/60 lg:mt-2 lg:text-sm">
                    {ja ? recipe.titleEn : recipe.titleJa}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        </div>

        <article
          id="recipe-preview"
          aria-live="polite"
          className="relative overflow-hidden border-4 border-black bg-white shadow-[6px_6px_0px_0px_#F3C63F] sm:border-[6px] sm:shadow-[8px_8px_0px_0px_#F3C63F]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selected.id}-${lang}`}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="border-b-[6px] border-black bg-black px-4 py-3 font-display sm:px-6 sm:py-4 text-[clamp(2rem,4vw,3rem)] leading-none tracking-wide text-mellow">
                {ja ? selected.titleJa : selected.titleEn}
              </h2>

              <div className="grid gap-6 p-4 sm:gap-7 sm:p-7 md:grid-cols-2">
                <section className="halftone border-4 border-black bg-parchment p-4 sm:p-5 md:col-span-2">
                  <h3 className="font-display text-2xl tracking-wide text-rose">{t.backstory}</h3>
                  <p className="mt-2 text-[1.05rem] leading-relaxed">
                    {ja ? selected.backstoryJa : selected.backstoryEn}
                  </p>
                </section>

                <section>
                  <h3 className="inline-block -rotate-1 border-4 border-black bg-mellow px-3 py-1 font-display text-2xl tracking-wide shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    {t.ingredients}
                  </h3>
                  <ul className="mt-5 space-y-3">
                    {(ja ? selected.ingredientsJa : selected.ingredientsEn).map((item) => (
                      <li key={item} className="flex gap-3 leading-snug">
                        <span
                          aria-hidden
                          className="mt-1.5 size-3 shrink-0 rotate-45 border-2 border-black bg-rose"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="inline-block rotate-1 border-4 border-black bg-rose px-3 py-1 font-display text-2xl tracking-wide text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    {t.instructions}
                  </h3>
                  <ol className="mt-5 space-y-4">
                    {(ja ? selected.stepsJa : selected.stepsEn).map((step, index) => (
                      <li key={step} className="flex gap-3 leading-snug">
                        <span
                          aria-hidden
                          className="grid size-9 shrink-0 place-items-center rounded-full border-4 border-black bg-mellow font-display text-lg"
                        >
                          {index + 1}
                        </span>
                        <span className="pt-1">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </motion.div>
          </AnimatePresence>
        </article>
      </div>
    </motion.section>
  );
}
