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

  return (
    <section className="panel mt-4">
      <h3 className="mb-1 text-lg font-semibold">Document Structure Analyzer</h3>
      <p className="mb-3 text-xs text-muted">Extract key sections from uploaded materials and start tracking progress.</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
        <select
          className="input"
          value={activePdfId || ''}
          onChange={(e) => onSelectActivePdf?.(e.target.value)}
          disabled={!chunks.length}
        >
          {!chunks.length ? <option value="">Upload a PDF first</option> : null}
          {chunks.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          disabled={!selectedChunk || isAnalyzing}
          onClick={() => selectedChunk && onAnalizar(selectedChunk.id)}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze sections'}
        </button>
      </div>
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
