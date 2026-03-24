import { CircleCheck, CircleX, Info, Sparkles } from 'lucide-react';

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
        ) : modelStatus.healthHint === 'missing_ollama_api_key' ? (
          <span
            className="inline-flex max-w-[260px] cursor-help items-center gap-1 text-amber-800 md:max-w-none"
            title={modelStatus.healthDetail || 'Create a key at ollama.com/settings/keys and set OLLAMA_API_KEY on Render (Environment), then redeploy.'}
          >
            <Info size={14} /> Add OLLAMA_API_KEY on Render
          </span>
        ) : modelStatus.healthHint === 'render_needs_ollama_url' ? (
          <span
            className="inline-flex max-w-[260px] cursor-help items-center gap-1 text-amber-800 md:max-w-none"
            title={modelStatus.healthDetail || 'Set OLLAMA_URL=https://ollama.com (or your Ollama server) in Render → Environment.'}
          >
            <Info size={14} /> Set OLLAMA_URL on Render
          </span>
        ) : modelStatus.deployHost === 'render' && !modelStatus.healthHint ? (
          <span
            className="inline-flex max-w-[220px] cursor-help items-center gap-1 text-amber-800 md:max-w-none"
            title="Render does not run Ollama locally. Point OLLAMA_URL to Ollama Cloud or another reachable server, or use the app on your PC with local Ollama."
          >
            <Info size={14} /> No Ollama on this host
          </span>
        ) : (
          <span
            className="inline-flex max-w-[min(100%,280px)] cursor-help items-center gap-1 text-rose-600 md:max-w-none"
            title={
              modelStatus.healthDetail ||
              'The UI talks to Ollama only through the Node API. Run npm run dev:full (or npm run server + npm run dev). Ollama must be running (ollama serve) on port 11434.'
            }
          >
            <CircleX size={14} /> AI offline
          </span>
        )}
      </div>
    </header>
  );
}
