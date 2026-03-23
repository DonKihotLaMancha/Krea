import { useMemo, useState } from 'react';

export default function NotebookWorkspace({
  chunks,
  onSourceChat,
  onSummary,
  onStudyGuide,
  onCompare,
  onAudioOverview,
  isBusy,
}) {
  const [selectedChunkIds, setSelectedChunkIds] = useState([]);
  const [question, setQuestion] = useState('');
  const [chatResult, setChatResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [studyGuide, setStudyGuide] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [audioOverview, setAudioOverview] = useState(null);

  const selectedSources = useMemo(() => {
    if (!chunks.length) return [];
    const ids = selectedChunkIds.length ? selectedChunkIds : [chunks[0].id];
    return chunks
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ name: c.name, content: c.content }));
  }, [chunks, selectedChunkIds]);

  const noSources = !chunks.length;
  const safeRun = async (cb, setter) => {
    try {
      const result = await cb();
      setter(result);
    } catch {
      setter(null);
    }
  };

  return (
    <section className="panel">
      <h3 className="mb-1 text-lg font-semibold">Notebook</h3>
      <p className="mb-3 text-xs text-muted">Source-grounded workflows with citations, guides, compare, and audio script.</p>

      <div className="mb-3 flex flex-col gap-2">
        <select
          className="input"
          multiple
          value={selectedChunkIds}
          onChange={(e) => setSelectedChunkIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
          disabled={noSources || isBusy}
          size={Math.min(6, Math.max(3, chunks.length || 3))}
        >
          {!chunks.length ? <option value="">Upload a PDF first</option> : null}
          {chunks.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {!!chunks.length ? <p className="text-xs text-muted">Select one or more sources for Notebook actions.</p> : null}
      </div>

      <div className="rounded-xl border border-border bg-white p-3">
        <p className="mb-2 text-sm font-semibold">Source-grounded chat</p>
        <textarea
          className="input min-h-20"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question from your selected PDFs..."
        />
        <button
          className="btn-primary mt-2"
          disabled={isBusy || noSources || !question.trim()}
          onClick={async () => safeRun(() => onSourceChat({ question, sources: selectedSources }), setChatResult)}
        >
          {isBusy ? 'Working...' : 'Ask with citations'}
        </button>
        {chatResult ? (
          <div className="mt-3 rounded-lg border border-border bg-slate-50 p-3">
            <p className="text-sm">{chatResult.answer}</p>
            <ul className="mt-2 space-y-2">
              {(chatResult.citations || []).map((c, i) => (
                <li key={`c-${i}`} className="rounded border border-border bg-white p-2 text-xs">
                  <p className="font-semibold">{c.source}</p>
                  <p className="text-muted">{c.excerpt}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Summary</p>
            <button
              className="btn-ghost"
              disabled={isBusy || noSources}
              onClick={async () => safeRun(() => onSummary({ sources: selectedSources }), setSummary)}
            >
              Generate
            </button>
          </div>
          {summary ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">{summary.title}</p>
              <ul className="list-disc pl-4 text-muted">{(summary.keyPoints || []).map((p, i) => <li key={`kp-${i}`}>{p}</li>)}</ul>
            </div>
          ) : <p className="text-xs text-muted">No summary generated yet.</p>}
        </div>

        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Study guide</p>
            <button
              className="btn-ghost"
              disabled={isBusy || noSources}
              onClick={async () => safeRun(() => onStudyGuide({ sources: selectedSources }), setStudyGuide)}
            >
              Generate
            </button>
          </div>
          {studyGuide?.sections?.length ? (
            <ul className="space-y-2 text-xs">
              {studyGuide.sections.map((s, i) => (
                <li key={`sg-${i}`} className="rounded border border-border bg-slate-50 p-2">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-muted">{s.summary}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">No study guide generated yet.</p>}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Compare sources</p>
            <button
              className="btn-ghost"
              disabled={isBusy || selectedSources.length < 2}
              onClick={async () => safeRun(() => onCompare({ sources: selectedSources }), setComparison)}
            >
              Compare
            </button>
          </div>
          {comparison ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">Agreements</p>
              <ul className="list-disc pl-4 text-muted">{(comparison.agreements || []).map((x, i) => <li key={`a-${i}`}>{x}</li>)}</ul>
              <p className="font-semibold">Conflicts</p>
              <ul className="list-disc pl-4 text-muted">{(comparison.conflicts || []).map((x, i) => <li key={`f-${i}`}>{x}</li>)}</ul>
            </div>
          ) : <p className="text-xs text-muted">Select at least 2 sources to compare.</p>}
        </div>

        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Audio overview</p>
            <button
              className="btn-ghost"
              disabled={isBusy || noSources}
              onClick={async () => safeRun(() => onAudioOverview({ sources: selectedSources }), setAudioOverview)}
            >
              Generate briefing
            </button>
          </div>
          {audioOverview ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">{audioOverview.title}</p>
              {audioOverview.audioUrl ? (
                <audio controls src={audioOverview.audioUrl} className="w-full" />
              ) : (
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-border bg-slate-50 p-2 text-muted">
                  {audioOverview.script}
                </pre>
              )}
            </div>
          ) : <p className="text-xs text-muted">No audio/script generated yet.</p>}
        </div>
      </div>
    </section>
  );
}
