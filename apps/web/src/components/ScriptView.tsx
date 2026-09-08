'use client';

import { useMemo } from 'react';
import { ScrollText, Wand2 } from 'lucide-react';
import type { GeneratedContent } from '@/utils/types';

/** Full screenplay text produced by the pipeline, with the agent's reasoning. */
export function ScriptView({ content }: { content: GeneratedContent | null }) {
  const lines = useMemo(
    () => (content ? content.scriptText.split('\n') : []),
    [content],
  );

  if (!content) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center text-center">
        <p className="mono max-w-64 text-[11px] leading-relaxed text-cine-dim">
          Generate a piece to see the synthesized screenplay, grade, score plan
          and the concepts it was cut from.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-cine-text">
          <ScrollText size={14} className="text-cine-amber" /> {content.title}
        </span>
        <span className="mono rounded-full border border-cine-line px-2 py-0.5 text-[10px] text-cine-dim">
          via {content.blueprint.generator === 'llama-3' ? 'Llama-3' : 'local screenwriter'}
        </span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-cine-text/80">{content.logline}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {content.blueprint.conceptsUsed.slice(0, 6).map((c) => (
          <span
            key={c.conceptId}
            className="mono rounded-full border border-cine-violet/40 bg-cine-violet/10 px-2 py-0.5 text-[10px] text-cine-violet"
          >
            {c.title} · {c.score.toFixed(2)}
          </span>
        ))}
      </div>
      <pre className="mono min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-cine-line/70 bg-cine-bg/70 p-3 text-[11px] leading-relaxed text-cine-text/85">
        {lines.join('\n')}
      </pre>
      <p className="mono mt-2 flex items-center gap-1 text-[10px] text-cine-dim">
        <Wand2 size={11} /> retrieval query: “{content.retrievalQuery ?? '—'}”
      </p>
    </div>
  );
}
