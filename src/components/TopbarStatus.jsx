import { CircleCheck, CircleX, Sparkles } from 'lucide-react';

export default function TopbarStatus({ title, modelStatus, latestBatchAt }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-border bg-white/90 px-4 py-3 shadow-soft backdrop-blur">
      <div>
        <h2 className="bg-gradient-to-r from-indigo-700 via-violet-700 to-sky-600 bg-clip-text text-lg font-semibold text-transparent">{title}</h2>
        <p className="text-xs text-muted">{latestBatchAt ? `Last generated: ${latestBatchAt}` : 'Upload a PDF to start.'}</p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700">
          <Sparkles size={14} />
          {modelStatus.model || 'Model'}
        </span>
        {modelStatus.ok ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <CircleCheck size={14} /> AI connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-600">
            <CircleX size={14} /> AI offline
          </span>
        )}
      </div>
    </header>
  );
}
