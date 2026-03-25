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
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">Upload Study Material</h3>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-900">
          {chunks.length} file{chunks.length === 1 ? '' : 's'} in workspace
        </span>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Saved materials</p>
          {isSignedIn ? (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1 text-xs"
              disabled={libraryReloadBusy || isGenerating || ingestBusy}
              onClick={() => onReloadLibrary?.()}
            >
              {libraryReloadBusy ? 'Loading…' : 'Refresh from account'}
            </button>
          ) : null}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          {isSignedIn
            ? 'These materials load from your account on each visit. If the server is briefly unavailable, the app can show the last copy saved in this browser (under the size limit). Click a row to select it for Flashcards, Notebook, Concept Map, and other tools.'
            : 'Documents you add are kept in this browser only. Sign in to save materials to your account and open them on any device, then use “Refresh from account” on Ingest.'}
        </p>
        {chunks.length ? (
          <ul className="space-y-2">
            {chunks.map((c) => {
              const isActive = c.id === activePdfId;
              return (
                <li key={c.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => onSelectPdf?.(c.id)}
                    aria-pressed={isActive}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? 'border-indigo-400 bg-white text-slate-900 ring-1 ring-indigo-200'
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
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-sm text-muted">
            <p className="font-medium text-slate-700">No materials loaded yet</p>
            <p className="mt-1 text-xs">
              {isSignedIn
                ? 'Upload a file below, or tap “Refresh from account” if you already saved files on another session.'
                : 'Upload a PDF or text file below to get started (Office/images need sign-in).'}
            </p>
          </div>
        )}
      </div>

      <label
        className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 via-violet-50 to-cyan-50 p-8 text-center transition hover:shadow-soft ${ingestBusy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <UploadCloud className="mb-2" size={24} />
        <p className="text-sm font-medium">Add another file (drag and drop or click)</p>
        <p className="text-xs text-muted">
          Signed in: PDF, DOCX, PPTX, text, and images (OCR) are digested on the server, cached, and saved to your account. Chat search indexing can take 1–3 minutes for large files. Flashcards generate automatically after upload.
        </p>
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
          <div className="h-2 w-full rounded-full bg-slate-100">
            {isIndeterminate ? (
              <div className="h-2 w-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 animate-pulse" />
            ) : (
              <div
                className="h-2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 transition-all duration-300"
                style={{ width: `${Math.max(6, Math.min(100, progress))}%` }}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
