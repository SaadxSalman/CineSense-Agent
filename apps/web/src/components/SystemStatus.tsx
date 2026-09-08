'use client';

import { Activity, Camera, Cloud, Cpu, Database, Feather, RadioTower } from 'lucide-react';
import { trpc } from '@/utils/trpc';

interface Subsystem {
  online: boolean;
  detail: string;
}

const ICONS: Record<string, React.ReactNode> = {
  orchestrator: <RadioTower size={15} />,
  store: <Database size={15} />,
  creativeAgent: <Feather size={15} />,
  inferenceBridge: <Camera size={15} />,
  engine: <Cpu size={15} />,
  embeddings: <Cloud size={15} />,
  websocket: <Activity size={15} />,
};

const LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  store: 'Store',
  creativeAgent: 'Creative Agent',
  inferenceBridge: 'Vision/Audio Bridge',
  engine: 'Rust Engine',
  embeddings: 'Embeddings',
  websocket: 'Live Bus',
};

export function SystemStatus() {
  const { data, isLoading } = trpc.health.diagnostics.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const subsystems = (data?.subsystems ?? {}) as Record<string, Subsystem | undefined>;

  return (
    <div className="panel px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cine-dim">
          System Status
        </span>
        <span className="mono text-[10px] text-cine-dim">
          {isLoading ? 'probing…' : `${data?.conceptCount ?? '—'} concepts indexed`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(subsystems).map(([key, sub]) => {
          if (!sub) return null;
          return (
            <div
              key={key}
              title={sub.detail}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                sub.online
                  ? 'border-emerald-900/70 bg-emerald-950/40 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-500'
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  sub.online ? 'bg-emerald-400' : 'bg-zinc-600'
                }`}
              />
              {ICONS[key]}
              {LABELS[key] ?? key}
            </div>
          );
        })}
      </div>
    </div>
  );
}
