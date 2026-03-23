import { UploadCloud } from 'lucide-react';

export default function UploadCard({ onFile, onGenerateLatest, chunks, isGenerating }) {
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
