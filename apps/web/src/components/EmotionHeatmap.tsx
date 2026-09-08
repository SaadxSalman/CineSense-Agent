'use client';

import { motion } from 'framer-motion';

/**
 * Real-time Emotion Heatmap — an 8x8 grid rendered from either the webcam
 * brightness grid or the agent-synthesized arousal/engagement blob.
 * Cell color temperature follows valence (warm = positive, cold = negative).
 */
export function EmotionHeatmap({ heatmap, valence }: { heatmap: number[]; valence: number }) {
  const warm = valence >= 0;
  return (
    <div className="grid grid-cols-8 gap-1">
      {heatmap.map((v, i) => (
        <motion.div
          key={i}
          className="aspect-square rounded-[3px]"
          animate={{
            backgroundColor:
              v < 0.12
                ? '#16161f'
                : warm
                  ? `rgba(242, 163, 60, ${Math.min(1, 0.12 + v * 0.95).toFixed(2)})`
                  : `rgba(229, 25, 55, ${Math.min(1, 0.1 + v * 0.8).toFixed(2)})`,
            scale: 0.82 + v * 0.18,
          }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
