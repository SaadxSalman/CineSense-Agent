'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Film, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { TrailerBlueprint } from '@/utils/types';

/**
 * CineSynth Player — renders the Synthesis Agent's TrailerBlueprint as an
 * animated storyboard: timed scenes, per-scene grade, Ken-Burns motion scaled
 * by the scene's motionIntensity, narration captions and optional TTS.
 */
export function TrailerPlayer({ blueprint }: { blueprint: TrailerBlueprint }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [tts, setTts] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = blueprint.scenes[sceneIdx];

  // advance scenes on their (accelerated) durations
  useEffect(() => {
    if (!playing || !scene) return;
    const durMs = Math.max(1400, scene.durationSec * 900);
    timerRef.current = setTimeout(() => {
      setSceneIdx((i) => (i + 1) % blueprint.scenes.length);
    }, durMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sceneIdx, playing, scene, blueprint.scenes.length]);

  // narration via SpeechSynthesis
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (tts && playing && scene?.narration) {
      const utter = new SpeechSynthesisUtterance(scene.narration);
      utter.rate = 0.92;
      utter.pitch = 0.85;
      window.speechSynthesis.speak(utter);
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, [sceneIdx, tts, playing, scene?.narration]);

  if (!scene) return null;

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-cine-line">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={sceneIdx}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scene.transition === 'cut' ? 0.08 : 0.6 }}
          >
            {/* scene backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 120% at 30% 20%, ${scene.visual.paletteRef}, #050508 85%)`,
              }}
              initial={{ scale: 1 }}
              animate={{ scale: 1 + scene.visual.motionIntensity * 0.28 }}
              transition={{ duration: Math.max(1.6, scene.durationSec), ease: 'linear' }}
            />
            {/* motion-energy grain */}
            <motion.div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)',
              }}
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: Math.max(0.6, 2.4 - scene.visual.motionIntensity * 2),
                repeat: Infinity,
                ease: 'linear',
              }}
            />
            {/* letterbox for widescreen aspect */}
            {blueprint.aspect === '2.39:1' && (
              <>
                <div className="absolute inset-x-0 top-0 h-[10%] bg-black" />
                <div className="absolute inset-x-0 bottom-0 h-[10%] bg-black" />
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* HUD */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="mono rounded bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-cine-amber backdrop-blur">
            {scene.shot}
          </span>
          <span className="mono rounded bg-black/60 px-2 py-0.5 text-[10px] text-cine-text/80 backdrop-blur">
            {scene.title}
          </span>
        </div>
        <span className="mono absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[10px] text-cine-dim backdrop-blur">
          scene {sceneIdx + 1}/{blueprint.scenes.length} · {scene.durationSec}s · {scene.transition}
        </span>

        {/* narration / dialogue captions */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          {scene.dialogue.length > 0 ? (
            <div className="space-y-1">
              {scene.dialogue.map((d, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto max-w-2xl text-center text-sm text-white/90 drop-shadow"
                >
                  <span className="mono mr-1.5 text-[10px] uppercase tracking-widest text-cine-amber">
                    {d.speaker}
                  </span>
                  “{d.line}”
                </motion.p>
              ))}
            </div>
          ) : scene.narration ? (
            <motion.p
              key={sceneIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl text-center text-sm italic text-white/85 drop-shadow"
            >
              {scene.narration}
            </motion.p>
          ) : null}
        </div>
      </div>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex items-center gap-1.5 rounded-lg border border-cine-line bg-cine-panel px-3 py-1.5 text-xs text-cine-text transition hover:border-cine-amber/60"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setSceneIdx(0)}
          className="flex items-center gap-1.5 rounded-lg border border-cine-line bg-cine-panel px-3 py-1.5 text-xs text-cine-text transition hover:border-cine-amber/60"
        >
          <RotateCcw size={13} /> Restart
        </button>
        <button
          onClick={() => setTts((t) => !t)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
            tts
              ? 'border-cine-teal/70 bg-cine-teal/10 text-cine-teal'
              : 'border-cine-line bg-cine-panel text-cine-dim'
          }`}
        >
          {tts ? <Volume2 size={13} /> : <VolumeX size={13} />} Narration voice
        </button>
        <span className="mono ml-auto flex items-center gap-1.5 text-[10px] text-cine-dim">
          <Film size={12} /> {blueprint.aspect} · {blueprint.grade.name} · {blueprint.music.key}{' '}
          {blueprint.music.tempoBpm}BPM
        </span>
      </div>

      {/* scene strip */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {blueprint.scenes.map((s) => (
          <button
            key={s.index}
            onClick={() => setSceneIdx(s.index)}
            className={`h-10 w-16 shrink-0 rounded-md border transition ${
              s.index === sceneIdx ? 'border-cine-amber' : 'border-cine-line opacity-70 hover:opacity-100'
            }`}
            style={{ background: `linear-gradient(135deg, ${s.visual.paletteRef}, #0a0a12)` }}
            title={s.title}
          />
        ))}
      </div>

    </div>
  );
}
