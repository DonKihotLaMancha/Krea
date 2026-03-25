import { useCallback, useEffect, useMemo, useState } from 'react';

const TTS_VOICE_STORAGE_KEY = 'sa-notebook-tts-voice-uri';

export default function NotebookWorkspace({
  chunks,
  activePdfId = '',
  onSourceChat,
  onSummary,
  onStudyGuide,
  onCompare,
  onAudioOverview,
  conceptMapData,
  onCitationSelect,
  onCreateFlashcardFromSelection,
  onSummarizeSelection,
  onExplainSelection,
  isBusy,
  onError,
}) {
  const [selectedChunkIds, setSelectedChunkIds] = useState([]);
  const [question, setQuestion] = useState('');
  const [chatResult, setChatResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [studyGuide, setStudyGuide] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [audioOverview, setAudioOverview] = useState(null);
  const [selectionText, setSelectionText] = useState('');
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [localLoading, setLocalLoading] = useState(null);
  const [errors, setErrors] = useState({
    chat: '',
    summary: '',
    studyGuide: '',
    compare: '',
    audio: '',
  });
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsVoiceUri, setTtsVoiceUri] = useState(() => {
    try {
      return localStorage.getItem(TTS_VOICE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [ttsSpeaking, setTtsSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const load = () => setTtsVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const pickUtteranceVoice = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const list = window.speechSynthesis.getVoices();
    if (!list.length) return null;
    if (ttsVoiceUri) {
      const hit = list.find((v) => v.voiceURI === ttsVoiceUri);
      if (hit) return hit;
    }
    return list.find((v) => /^en(-|$)/i.test(v.lang || '')) || list[0];
  }, [ttsVoiceUri]);

  const stopTts = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setTtsSpeaking(false);
  }, []);

  const playTts = useCallback(
    (text) => {
      if (typeof window === 'undefined' || !window.speechSynthesis || !String(text || '').trim()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 32000));
      const v = pickUtteranceVoice();
      if (v) u.voice = v;
      u.onend = () => setTtsSpeaking(false);
      u.onerror = () => setTtsSpeaking(false);
      setTtsSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [pickUtteranceVoice],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    return () => window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!ttsVoiceUri) return;
    try {
      localStorage.setItem(TTS_VOICE_STORAGE_KEY, ttsVoiceUri);
    } catch {
      /* ignore */
    }
  }, [ttsVoiceUri]);

  useEffect(() => {
    if (!chunks.length) {
      setSelectedChunkIds([]);
      return;
    }
    if (activePdfId && chunks.some((c) => c.id === activePdfId)) {
      setSelectedChunkIds([activePdfId]);
      return;
    }
    setSelectedChunkIds((prev) => {
      const valid = new Set(chunks.map((c) => c.id));
      const next = prev.filter((id) => valid.has(id));
      return next.length ? next : [chunks[0].id];
    });
  }, [chunks, activePdfId]);

  const toggleChunk = (id) => {
    setSelectedChunkIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const selectedSources = useMemo(() => {
    if (!chunks.length) return [];
    const ids = selectedChunkIds.length ? selectedChunkIds : [chunks[0].id];
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return chunks
      .filter((c) => ids.includes(c.id))
      .map((c) => {
        const o = { name: c.name, content: c.content };
        const sid = c.sourceId || (String(c.id).startsWith('db-pdf-') ? c.id.slice(7) : null);
        if (sid && uuidRe.test(sid)) o.sourceId = sid;
        return o;
      });
  }, [chunks, selectedChunkIds]);

  const noSources = !chunks.length;
  const busy = isBusy || localLoading;

  const runSection = async (key, cb, setter) => {
    setErrors((e) => ({ ...e, [key]: '' }));
    setLocalLoading(key);
    try {
      const result = await cb();
      setter(result);
    } catch (err) {
      const msg = err?.message || 'Request failed';
      setErrors((e) => ({ ...e, [key]: msg }));
      onError?.(msg);
      setter(null);
    } finally {
      setLocalLoading(null);
    }
  };

  const errBox = (key) =>
    errors[key] ? (
      <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-900">{errors[key]}</p>
    ) : null;

  const handleSelection = (event) => {
    const selected = String(window.getSelection?.()?.toString?.() || '').trim();
    if (selected.length < 8) {
      setSelectionText('');
      return;
    }
    setSelectionText(selected.slice(0, 400));
    setSelectionPos({ x: event.clientX, y: event.clientY });
  };

  return (
    <section className="panel" onMouseUp={handleSelection}>
      <h3 className="mb-1 text-lg font-semibold">Notebook</h3>
      <p className="mb-3 text-xs text-muted">Source-grounded workflows with citations, guides, compare, and audio script.</p>
      {conceptMapData?.nodes?.length ? (
        <div className="mb-3 rounded-xl border border-border bg-white p-3">
          <p className="text-xs font-semibold text-muted">Concept Map Snapshot</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {conceptMapData.nodes.slice(0, 6).map((n) => (
              <span key={n.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
                {n.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 rounded-xl border border-border bg-slate-50/80 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-800">Sources for Notebook (pick up to 5)</p>
        {!chunks.length ? (
          <p className="text-xs text-muted">Upload a PDF in Ingest first.</p>
        ) : (
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {chunks.map((c) => {
              const checked = selectedChunkIds.includes(c.id);
              return (
                <li key={c.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-border"
                    checked={checked}
                    disabled={busy || (!checked && selectedChunkIds.length >= 5)}
                    onChange={() => toggleChunk(c.id)}
                  />
                  <span className="min-w-0 flex-1 text-sm leading-snug">{c.name}</span>
                </li>
              );
            })}
          </ul>
        )}
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
          disabled={busy || noSources || !question.trim()}
          onClick={async () =>
            runSection('chat', () => onSourceChat({ question, sources: selectedSources }), setChatResult)
          }
        >
          {localLoading === 'chat' ? 'Working...' : 'Ask with citations'}
        </button>
        {errBox('chat')}
        {chatResult ? (
          <div className="mt-3 rounded-lg border border-border bg-slate-50 p-3">
            <p className="text-sm">{chatResult.answer}</p>
            <ul className="mt-2 space-y-2">
              {(chatResult.citations || []).map((c, i) => (
                <li key={`c-${i}`} className="rounded border border-border bg-white p-2 text-xs">
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => onCitationSelect?.(c)}
                    title="Jump to citation source"
                  >
                    <p className="font-semibold underline decoration-dotted">{c.source}</p>
                    <p className="text-muted">{c.excerpt}</p>
                  </button>
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
              disabled={busy || noSources}
              onClick={async () => runSection('summary', () => onSummary({ sources: selectedSources }), setSummary)}
            >
              {localLoading === 'summary' ? '…' : 'Generate'}
            </button>
          </div>
          {errBox('summary')}
          {summary ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">{summary.title}</p>
              <ul className="list-disc pl-4 text-muted">{(summary.keyPoints || []).map((p, i) => <li key={`kp-${i}`}>{p}</li>)}</ul>
            </div>
          ) : (
            <p className="text-xs text-muted">No summary generated yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Study guide</p>
            <button
              className="btn-ghost"
              disabled={busy || noSources}
              onClick={async () => runSection('studyGuide', () => onStudyGuide({ sources: selectedSources }), setStudyGuide)}
            >
              {localLoading === 'studyGuide' ? '…' : 'Generate'}
            </button>
          </div>
          {errBox('studyGuide')}
          {studyGuide?.sections?.length ? (
            <ul className="space-y-2 text-xs">
              {studyGuide.sections.map((s, i) => (
                <li key={`sg-${i}`} className="rounded border border-border bg-slate-50 p-2">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-muted">{s.summary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No study guide generated yet.</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Compare sources</p>
            <button
              className="btn-ghost"
              disabled={busy || selectedSources.length < 2}
              onClick={async () => runSection('compare', () => onCompare({ sources: selectedSources }), setComparison)}
            >
              {localLoading === 'compare' ? '…' : 'Compare'}
            </button>
          </div>
          {errBox('compare')}
          {comparison ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">Agreements</p>
              <ul className="list-disc pl-4 text-muted">{(comparison.agreements || []).map((x, i) => <li key={`a-${i}`}>{x}</li>)}</ul>
              <p className="font-semibold">Conflicts</p>
              <ul className="list-disc pl-4 text-muted">{(comparison.conflicts || []).map((x, i) => <li key={`f-${i}`}>{x}</li>)}</ul>
            </div>
          ) : (
            <p className="text-xs text-muted">Select at least 2 sources to compare.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Audio overview</p>
            <button
              className="btn-ghost"
              disabled={busy || noSources}
              onClick={async () =>
                runSection('audio', () => onAudioOverview({ sources: selectedSources }), setAudioOverview)
              }
            >
              {localLoading === 'audio' ? '…' : 'Generate briefing'}
            </button>
          </div>
          {errBox('audio')}
          {audioOverview ? (
            <div className="space-y-2 text-xs">
              <p className="font-semibold">{audioOverview.title}</p>
              <p className="text-[11px] leading-snug text-muted">
                Ollama wrote the script below. Playback uses your browser&apos;s built-in voices (not Ollama).
              </p>
              {audioOverview.audioUrl ? <audio controls src={audioOverview.audioUrl} className="w-full" /> : null}
              {typeof window !== 'undefined' && window.speechSynthesis ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="shrink-0 text-muted">Voice</span>
                    <select
                      className="input min-w-0 flex-1 py-1 text-xs"
                      value={ttsVoiceUri}
                      onChange={(e) => setTtsVoiceUri(e.target.value)}
                    >
                      <option value="">Default (English if available)</option>
                      {ttsVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang || '?'})
                        </option>
                      ))}
                    </select>
                  </label>
                  {ttsSpeaking ? (
                    <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={stopTts}>
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary !px-2 !py-1 text-xs"
                      onClick={() => playTts(audioOverview.script)}
                    >
                      Play overview
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted">Speech synthesis is not available in this browser.</p>
              )}
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-border bg-slate-50 p-2 text-muted">
                {audioOverview.script}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-muted">No audio/script generated yet.</p>
          )}
        </div>
      </div>
      {selectionText ? (
        <div
          className="fixed z-40 flex gap-1 rounded-lg border border-border bg-white p-1 shadow-soft"
          style={{ left: Math.max(12, selectionPos.x - 130), top: Math.max(12, selectionPos.y - 46) }}
        >
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onCreateFlashcardFromSelection?.(selectionText)}>
            Create Flashcard
          </button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onSummarizeSelection?.(selectionText)}>
            Summarize This
          </button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onExplainSelection?.(selectionText)}>
            Explain Like I&apos;m 5
          </button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setSelectionText('')}>
            X
          </button>
        </div>
      ) : null}
    </section>
  );
}
