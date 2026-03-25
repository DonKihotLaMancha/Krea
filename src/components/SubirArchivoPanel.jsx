export default function SubirArchivoPanel({
  chunks,
  apartados,
  setApartados,
  isAnalyzing,
  onAnalizar,
  activePdfId = '',
  onSelectActivePdf,
}) {
  const selectedChunk = chunks.find((c) => c.id === activePdfId) || chunks[0];
  const indexing = selectedChunk?.ingestStatus === 'indexing';

  return (
    <section className="panel mt-3">
      <h3 className="mb-0.5 text-base font-semibold">Document Structure Analyzer</h3>
      <p className="mb-2 text-xs text-muted">Extract sections and track progress.</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
        <select
          className="input"
          value={activePdfId || ''}
          onChange={(e) => onSelectActivePdf?.(e.target.value)}
          disabled={!chunks.length}
        >
          {!chunks.length ? <option value="">Upload a document first</option> : null}
          {chunks.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          disabled={!selectedChunk || isAnalyzing || indexing}
          onClick={() => selectedChunk && onAnalizar(selectedChunk.id)}
        >
          {indexing ? 'Wait for indexing…' : isAnalyzing ? 'Analyzing...' : 'Analyze sections'}
        </button>
      </div>
      {indexing ? (
        <p
          className="mt-2 text-xs text-amber-800"
          title="Embeddings can take ~1 minute. Reload library if needed, then analyze."
        >
          Still indexing — wait a minute, then analyze.
        </p>
      ) : null}
      {apartados.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            onClick={() =>
              setApartados((prev) =>
                prev.map((a) => ({
                  ...a,
                  porcentaje: 0,
                  estado: 'pendiente',
                  fechas_trabajo: [],
                })),
              )
            }
          >
            Reset progress
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              setApartados((prev) =>
                prev.map((a) => ({
                  ...a,
                  porcentaje: 100,
                  estado: 'completado',
                })),
              )
            }
          >
            Mark all completed
          </button>
        </div>
      ) : null}
    </section>
  );
}
