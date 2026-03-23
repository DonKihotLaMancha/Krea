import { UploadCloud } from 'lucide-react';

export default function UploadCard({
  onFile,
  onGenerateLatest,
  chunks,
  isGenerating,
  progress = 0,
  progressLabel = '',
  isIndeterminate = false,
}) {
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Upload Study Material</h3>
      <label className="mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 p-8 text-center">
        <UploadCloud className="mb-2" size={24} />
        <p className="text-sm font-medium">Drag and drop PDF here, or click to upload</p>
        <p className="text-xs text-muted">Text-based PDF works best for accurate cards.</p>
        <input
          type="file"
          accept=".pdf,.txt,.md,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
      <button className="btn-primary" disabled={!chunks[0] || isGenerating} onClick={onGenerateLatest}>
        {isGenerating ? 'Generating your study set…' : 'Generate Flashcards (Latest Upload)'}
      </button>
      {(isGenerating || progress > 0) ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>{progressLabel || 'Working...'}</span>
            {!isIndeterminate ? <span>{Math.round(progress)}%</span> : <span>AI thinking...</span>}
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            {isIndeterminate ? (
              <div className="h-2 w-1/2 rounded-full bg-accent/80 animate-pulse" />
            ) : (
              <div
                className="h-2 rounded-full bg-accent transition-all duration-300"
                style={{ width: `${Math.max(6, Math.min(100, progress))}%` }}
              />
            )}
          </div>
        </div>
      ) : null}
      <ul className="mt-4 space-y-2">
        {chunks.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <span className="truncate">{c.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
