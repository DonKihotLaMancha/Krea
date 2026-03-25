import { UploadCloud } from 'lucide-react';

export default function UploadCard({
  onFile,
  onGenerateLatest,
  chunks,
  activePdfId = '',
  onSelectPdf,
  isGenerating,
  ingestBusy = false,
  progress = 0,
  progressLabel = '',
  isIndeterminate = false,
  isSignedIn = false,
  onReloadLibrary,
  libraryReloadBusy = false,
}) {
  const selected = chunks.find((c) => c.id === activePdfId) || chunks[0];
  return (
    <section className="panel">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Upload Study Material</h3>
        <span
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
          title={isSignedIn ? 'Synced when signed in; pick one for all tools.' : 'Files stay on this device until you sign in.'}
        >
          {chunks.length} file{chunks.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Saved materials</p>
          {isSignedIn ? (
            <button
              type="button"
              className="btn-ghost !px-2 !py-0.5 text-xs"
              title="Reload files saved to your account"
              disabled={libraryReloadBusy || isGenerating || ingestBusy}
              onClick={() => onReloadLibrary?.()}
            >
              {libraryReloadBusy ? 'Loading…' : 'Sync'}
            </button>
          ) : null}
        </div>
        <p className="mb-1.5 text-xs text-muted">
          {isSignedIn ? 'Account library · click a file to select' : 'Local only · sign in to sync'}
        </p>
        {chunks.length ? (
          <ul className="space-y-1">
            {chunks.map((c) => {
              const isActive = c.id === activePdfId;
              return (
                <li key={c.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => onSelectPdf?.(c.id)}
                    aria-pressed={isActive}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${
                      isActive
                        ? 'border-slate-400 bg-white text-slate-900 ring-1 ring-slate-200'
                        : 'border-border bg-white hover:border-slate-300 hover:bg-slate-50/90'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {c.createdAt ? (
                      <span className="shrink-0 text-xs text-muted">{new Date(c.createdAt).toLocaleString()}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            className="rounded-lg border border-dashed border-slate-200 bg-white px-2 py-3 text-center text-sm text-muted"
            title={
              isSignedIn
                ? 'Upload below, or use Sync if files exist on your account from another device.'
                : 'PDF/text here; Office and images need sign-in for OCR.'
            }
          >
            <p className="font-medium text-slate-700">No materials yet</p>
            <p className="mt-0.5 text-xs">Add a file below{isSignedIn ? ', or Sync' : ''}</p>
          </div>
        )}
      </div>

      <label
        title="PDF, DOCX, PPTX, text, images (OCR when signed in)"
        className={`mb-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition ${ingestBusy ? 'pointer-events-none opacity-60' : 'hover:bg-slate-100'}`}
      >
        <UploadCloud className="mb-1.5" size={22} />
        <p className="text-sm font-medium">Drop or click to add a file</p>
        <p className="text-xs text-muted">PDF, Office, text, images</p>
        <input
          type="file"
          accept=".pdf,.txt,.md,.csv,.docx,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp"
          className="hidden"
          disabled={ingestBusy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
      <button
        className="btn-primary w-full md:w-auto"
        disabled={!selected || isGenerating || ingestBusy}
        onClick={onGenerateLatest}
      >
        {isGenerating ? 'Generating your study set…' : ingestBusy ? 'Digesting or saving file…' : 'Generate flashcards (selected)'}
      </button>
      {(isGenerating || ingestBusy || progress > 0) ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span className="min-w-0 pr-2">{progressLabel || 'Working...'}</span>
            {!isIndeterminate ? <span className="shrink-0">{Math.round(progress)}%</span> : <span className="shrink-0 text-muted">…</span>}
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            {isIndeterminate ? (
              <div className="h-1.5 w-1/2 rounded-full bg-slate-400 animate-pulse" />
            ) : (
              <div
                className="h-1.5 rounded-full bg-slate-700 transition-all duration-300"
                style={{ width: `${Math.max(6, Math.min(100, progress))}%` }}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
