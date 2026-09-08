'use client';

import { History } from 'lucide-react';
import type { GeneratedContent } from '@/utils/types';

export function HistoryList({
  items,
  onSelect,
  selectedId,
}: {
  items: GeneratedContent[];
  onSelect: (c: GeneratedContent) => void;
  selectedId?: string;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cine-dim">
        <History size={13} /> Generated pieces
      </h3>
      {items.length === 0 ? (
        <p className="mono text-[11px] text-cine-dim">Nothing synthesized yet.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((c) => (
            <button
              key={c.contentId}
              onClick={() => onSelect(c)}
              className={`block w-full rounded-lg border px-3 py-2 text-left transition ${
                c.contentId === selectedId
                  ? 'border-cine-amber/70 bg-cine-amber/10'
                  : 'border-cine-line/70 bg-cine-bg/50 hover:border-cine-amber/40'
              }`}
            >
              <span className="block truncate text-xs font-medium text-cine-text">{c.title}</span>
              <span className="mono mt-0.5 block text-[10px] text-cine-dim">
                {c.kind} · {new Date(c.createdAt).toLocaleTimeString()} · {c.blueprint.scenes.length} scenes
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
