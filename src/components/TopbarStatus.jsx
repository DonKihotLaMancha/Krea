import { CircleCheck, CircleX, Sparkles } from 'lucide-react';

export default function TopbarStatus({ title, modelStatus, latestBatchAt }) {
  return (
    <header className="mb-4 flex items-center justify-between rounded-xl2 border border-border bg-white px-4 py-3 shadow-soft">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted">{latestBatchAt ? `Last generated: ${latestBatchAt}` : 'Upload a PDF to start.'}</p>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-50 px-3 py-1">
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
