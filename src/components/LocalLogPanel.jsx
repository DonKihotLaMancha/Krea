import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiUrl } from '../lib/apiBase';

export default function LocalLogPanel({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch(apiUrl('/api/debug/logs'), { cache: 'no-store' });
        const data = await r.json().catch(() => ({}));
        if (mounted) {
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          setErr('');
        }
      } catch (e) {
        if (mounted) setErr(e?.message || 'Could not load logs.');
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-log-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="local-log-title" className="text-sm font-semibold text-slate-900">
            Local Ollama log
          </h2>
          <button type="button" className="btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          Recent errors from the Node API (no prompts). Refreshes every 4s.
        </p>
        {err ? (
          <p className="p-4 text-sm text-rose-600">{err}</p>
        ) : (
          <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-relaxed text-slate-800">
            {entries.length
              ? entries
                  .map((e) => {
                    const line = typeof e === 'object' && e
                      ? `${new Date(e.t || Date.now()).toISOString()} [${e.kind || 'log'}] ${JSON.stringify(e)}`
                      : String(e);
                    return line;
                  })
                  .join('\n')
              : 'No entries yet. Ollama failures will appear here.'}
          </pre>
        )}
      </div>
    </div>
  );
}
