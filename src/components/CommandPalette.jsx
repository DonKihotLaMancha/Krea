import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export default function CommandPalette({ open, onClose, items = [], onSelect }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    return items
      .filter((i) => `${i.label} ${i.category || ''}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [items, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-4 pt-[10vh]" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-white shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={16} className="text-muted" />
          <input
            className="w-full bg-transparent text-sm outline-none"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PDFs, flashcards, chat, notes..."
          />
          <button className="text-xs text-muted hover:text-text" onClick={onClose}>Esc</button>
        </div>
        <div className="max-h-[55vh] overflow-auto p-2">
          {filtered.length ? (
            filtered.map((item) => (
              <button
                key={item.id}
                className="mb-1 w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-border hover:bg-slate-50"
                onClick={() => {
                  onSelect?.(item);
                  onClose();
                }}
              >
                <p className="text-sm font-medium">{item.label}</p>
                {item.category ? <p className="text-xs text-muted">{item.category}</p> : null}
              </button>
            ))
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted">No results</p>
          )}
        </div>
      </div>
    </div>
  );
}

