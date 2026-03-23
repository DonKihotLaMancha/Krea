import { CircleCheck, CircleX, Sparkles } from 'lucide-react';

export default function TopbarStatus({
  title,
  modelStatus,
  latestBatchAt,
  isFocusMode,
  setIsFocusMode,
  onOpenSearch,
}) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-1 py-3 -mx-1 text-slate-900 md:px-2">
      <div>
        <div className="flex flex-wrap items-baseline gap-1.5 text-lg font-semibold text-slate-900">
          <span className="font-normal text-slate-600">Student Assistant</span>
          <span className="text-slate-300" aria-hidden>
            /
          </span>
          <span>{title}</span>
        </div>
        <p className="text-xs text-slate-600">{latestBatchAt ? `Last generated: ${latestBatchAt}` : 'Upload a PDF to start.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-900">
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onOpenSearch}>
          Search (Ctrl/Cmd+K)
        </button>
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setIsFocusMode?.((v) => !v)}>
          {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
        </button>
        <span className="inline-flex items-center gap-1 rounded-full border border-canvas-primary/25 bg-[#e8f4fc] px-3 py-1 text-canvas-primary">
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
