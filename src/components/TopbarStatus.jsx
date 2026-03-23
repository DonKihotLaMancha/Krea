import { CircleCheck, CircleX, Sparkles } from 'lucide-react';

export default function TopbarStatus({
  title,
  modelStatus,
  latestBatchAt,
  theme,
  setTheme,
  isFocusMode,
  setIsFocusMode,
  onOpenSearch,
}) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-border bg-white/90 px-4 py-3 shadow-soft backdrop-blur">
      <div>
        <h2 className="bg-gradient-to-r from-indigo-700 via-violet-700 to-sky-600 bg-clip-text text-lg font-semibold text-transparent">{title}</h2>
        <p className="text-xs text-muted">{latestBatchAt ? `Last generated: ${latestBatchAt}` : 'Upload a PDF to start.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onOpenSearch}>Search (Ctrl/Cmd+K)</button>
        <select className="input !py-1.5 text-xs" value={theme} onChange={(e) => setTheme?.(e.target.value)}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
          <option value="contrast">High Contrast</option>
        </select>
        <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setIsFocusMode?.((v) => !v)}>
          {isFocusMode ? 'Exit Focus' : 'Focus Mode'}
        </button>
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
