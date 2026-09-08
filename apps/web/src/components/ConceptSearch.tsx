'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkle } from 'lucide-react';
import type { Concept } from '@/utils/types';
import { trpc } from '@/utils/trpc';

const PRESETS = [
  'tense rain-soaked neon detective dread',
  'warm nostalgic summer first love',
  'frantic desert chase adrenaline',
  'meditative cosmic awe and sorrow',
];

export function ConceptSearch() {
  const [query, setQuery] = useState('');
  const search = trpc.concepts.search.useMutation();

  const run = (q: string) => {
    setQuery(q);
    if (q.trim().length >= 2) search.mutate({ query: q, k: 6 });
  };

  return (
    <div className="flex h-full flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="mb-3 flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe a feeling or a film vibe…"
          className="mono min-w-0 flex-1 rounded-lg border border-cine-line bg-cine-bg px-3 py-2 text-xs text-cine-text outline-none placeholder:text-cine-dim/60 focus:border-cine-violet/70"
        />
        <button
          type="submit"
          disabled={search.isPending}
          className="rounded-lg border border-cine-line bg-cine-panel px-3 py-2 text-cine-amber transition hover:border-cine-amber/60 disabled:opacity-50"
          aria-label="search concepts"
        >
          <Search size={15} />
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => run(p)}
            className="mono rounded-full border border-cine-line px-2 py-0.5 text-[10px] text-cine-dim transition hover:border-cine-violet/60 hover:text-cine-violet"
          >
            {p.split(' ').slice(0, 3).join(' ')}…
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {search.isPending && (
          <p className="mono text-[11px] text-cine-dim">embedding query & searching vectors…</p>
        )}
        {search.data?.results.map((c: Concept & { score: number }) => (
          <motion.div
            key={c.conceptId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-cine-line/70 bg-cine-bg/60 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkle size={11} className="text-cine-amber" />
                {c.title} {c.year ? <span className="text-cine-dim">({c.year})</span> : null}
              </span>
              <span className="mono text-[10px] text-cine-teal">{c.score.toFixed(3)}</span>
            </div>
            <p className="mono mt-1 text-[10px] text-cine-dim">{c.mood} · {c.pacing} · {c.tags.slice(0, 4).join(', ')}</p>
            <div className="mt-1.5 flex gap-1">
              {c.palette.map((hex) => (
                <span key={hex} className="h-2.5 w-8 rounded-sm border border-white/10" style={{ background: hex }} />
              ))}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-cine-line/50">
              <div className="h-full rounded-full bg-cine-teal/70" style={{ width: `${Math.max(4, c.score * 130)}%` }} />
            </div>
          </motion.div>
        ))}
        {search.data && search.data.results.length === 0 && (
          <p className="mono text-[11px] text-cine-dim">no concepts matched.</p>
        )}
      </div>
    </div>
  );
}
