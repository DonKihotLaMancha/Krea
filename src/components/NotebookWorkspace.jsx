import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, Plus, Search } from 'lucide-react';

const EXAM_QUESTION_PROMPT = 'Give me one exam-style question grounded in these sources.';
const CHIP =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-snug text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50 disabled:opacity-50';

const OUTPUT_KIND_LABEL = {
  chat: 'Answer',
  summary: 'Summary',
  studyGuide: 'Study guide',
  compare: 'Compare',
  audio: 'Audio overview',
  research: 'Research synthesis',
  cornell: 'Cornell notes',
  storyboard: 'Storyboard',
  anki: 'Anki',
  bottlenecks: 'Bottlenecks',
  socratic: 'Socratic',
};

const TTS_VOICE_STORAGE_KEY = 'sa-notebook-tts-voice-uri';

function sourceFileIcon(name) {
  const n = String(name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(n)) return FileImage;
  if (/\.(xlsx?|csv)$/i.test(n)) return FileSpreadsheet;
  return FileText;
}

/** Renders one saved notebook output (chat answer, study tool, etc.) */
function NotebookOutputBody({
  kind,
  data,
  onCitationSelect,
  ttsVoices,
  ttsVoiceUri,
  setTtsVoiceUri,
  ttsSpeaking,
  stopTts,
  playTts,
}) {
  if (data == null && kind !== 'anki') return null;

  switch (kind) {
    case 'chat': {
      const chatResult = data;
      return (
        <>
          <p className="text-sm leading-relaxed text-slate-800">{chatResult.answer}</p>
          <ul className="mt-3 space-y-1.5">
            {(chatResult.citations || []).map((c, i) => (
              <li key={`c-${i}`} className="rounded-xl border border-slate-200 bg-white p-2 text-xs">
                <button type="button" className="text-left" onClick={() => onCitationSelect?.(c)} title="Jump to citation source">
                  <p className="font-semibold underline decoration-dotted">{c.source}</p>
                  {c.passageId ? <p className="text-[10px] text-slate-500">Passage: {c.passageId}</p> : null}
                  <p className="text-muted">{c.excerpt}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case 'summary':
      return (
        <div className="space-y-2 text-xs">
          <p className="font-semibold">{data.title}</p>
          <ul className="list-disc pl-4 text-muted">{(data.keyPoints || []).map((p, i) => <li key={`kp-${i}`}>{p}</li>)}</ul>
        </div>
      );
    case 'studyGuide':
      return (
        <ul className="space-y-2 text-xs">
          {(data.sections || []).map((s, i) => (
            <li key={`sg-${i}`} className="rounded-lg border border-slate-200 bg-white p-2">
              <p className="font-semibold">{s.title}</p>
              <p className="text-muted">{s.summary}</p>
            </li>
          ))}
        </ul>
      );
    case 'compare':
      return (
        <div className="space-y-2 text-xs">
          <p className="font-semibold">Agreements</p>
          <ul className="list-disc pl-4 text-muted">{(data.agreements || []).map((x, i) => <li key={`a-${i}`}>{x}</li>)}</ul>
          <p className="font-semibold">Conflicts</p>
          <ul className="list-disc pl-4 text-muted">{(data.conflicts || []).map((x, i) => <li key={`f-${i}`}>{x}</li>)}</ul>
        </div>
      );
    case 'research':
      return (
        <div className="text-[11px]">
          <p className="font-semibold text-slate-800">Research synthesis</p>
          <p className="mt-1 text-slate-700">{data.answer}</p>
        </div>
      );
    case 'cornell':
      return (
        <div className="text-[11px]">
          <p className="font-semibold text-slate-800">Cornell notes</p>
          {(data.sections || []).slice(0, 4).map((s, i) => (
            <div key={`cn-${i}`} className="mt-1 border-t border-slate-100 pt-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-muted">{s.summary}</p>
            </div>
          ))}
        </div>
      );
    case 'bottlenecks':
      return (
        <div className="text-[11px] text-slate-700">
          <p className="font-semibold">Bottlenecks</p>
          <ul className="mt-1 space-y-1">
            {(data.bottlenecks || []).map((b, i) => (
              <li key={`bn-${i}`} className="rounded border border-amber-200 bg-amber-50/80 px-2 py-1">
                <span className="font-semibold">{b.concept}</span>
                {b.complexityScore != null ? <span className="text-muted"> · difficulty {b.complexityScore}/10</span> : null}: {b.whyHard}
                {b.complexityNote ? <span className="mt-0.5 block text-muted">{b.complexityNote}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'storyboard':
      return (
        <p className="text-[11px] text-slate-700">
          Storyboard saved: {data.title || 'Deck'} ({data.slideCount ?? 0} slides). Open Presentations to preview.
        </p>
      );
    case 'socratic':
      return (
        <div className="text-[11px]">
          <p className="text-slate-800">{data.reply}</p>
          <p className="mt-1 font-medium text-indigo-800">Challenge: {data.challengeQuestion}</p>
        </div>
      );
    case 'anki':
      return <p className="text-[11px] text-slate-700">Anki deck generated — check Flashcards if you were redirected.</p>;
    case 'audio':
      return (
        <div className="space-y-2 text-xs">
          <p className="font-semibold">{data.title}</p>
          <p className="text-[11px] leading-snug text-muted" title="Script from model; voice is browser TTS">
            Script from model · voice = browser TTS
          </p>
          {data.audioUrl ? <audio controls src={data.audioUrl} className="w-full" /> : null}
          {typeof window !== 'undefined' && window.speechSynthesis ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-1">
                <span className="shrink-0 text-muted">Voice</span>
                <select className="input min-w-0 flex-1 py-1 text-xs" value={ttsVoiceUri} onChange={(e) => setTtsVoiceUri(e.target.value)}>
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
                <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={() => playTts(data.script)}>
                  Play overview
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted">Speech synthesis is not available in this browser.</p>
          )}
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-muted">{data.script}</pre>
        </div>
      );
    default:
      return <p className="text-xs text-muted">Output</p>;
  }
}

export default function NotebookWorkspace({
  chunks,
  activePdfId = '',
  studentId = '',
  onOpenIngest,
  onAddWebSource,
  onSourceChat,
  onSummary,
  onStudyGuide,
  onCompare,
  onAudioOverview,
  onResearchSynthesis,
  onCornellNotes,
  onAnkiCards,
  onStoryboardPresentation,
  onDocumentBottlenecks,
  onSocraticTutor,
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
  /** @type {Array<{ kind: string; data: unknown; at: number }>} */
  const [outputHistory, setOutputHistory] = useState([]);
  const discard = () => {};
  const [selectionText, setSelectionText] = useState('');
  const [selectionPos, setSelectionPos] = useState({ x: 0, y: 0 });
  const [webUrl, setWebUrl] = useState('');
  const [localLoading, setLocalLoading] = useState(null);
  const [errors, setErrors] = useState({
    chat: '',
    summary: '',
    studyGuide: '',
    compare: '',
    audio: '',
    research: '',
    cornell: '',
    anki: '',
    storyboard: '',
    bottlenecks: '',
    socratic: '',
    webIngest: '',
  });
  const [bottlenecks, setBottlenecks] = useState(null);
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

  const maxPick = Math.min(5, chunks.length);
  const firstPickIds = chunks.slice(0, maxPick).map((c) => c.id);
  const allSelected =
    chunks.length > 0 &&
    selectedChunkIds.length === maxPick &&
    firstPickIds.every((id) => selectedChunkIds.includes(id)) &&
    selectedChunkIds.every((id) => firstPickIds.includes(id));

  const toggleSelectAll = () => {
    if (!chunks.length) return;
    if (allSelected) {
      setSelectedChunkIds([chunks[0].id]);
    } else {
      setSelectedChunkIds(firstPickIds);
    }
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

  const suggestedPrompts = useMemo(() => {
    const names = selectedSources.map((s) => s.name).filter(Boolean);
    const out = [];
    if (names[0]) {
      const short = names[0].replace(/\.[^.]+$/, '').slice(0, 48);
      out.push(`What are the main topics covered in ${short}?`);
    }
    out.push('How do the key ideas in these sources connect?', 'What should I review first based on difficulty?');
    return out.slice(0, 5);
  }, [selectedSources]);

  const pushOutput = useCallback((kind, data) => {
    if (data == null || data === false) return;
    setOutputHistory((h) => [...h.slice(-29), { kind, data, at: Date.now() }]);
  }, []);

  const latestOutput = outputHistory.length ? outputHistory[outputHistory.length - 1] : null;
  const olderOutputs = outputHistory.length > 1 ? outputHistory.slice(0, -1) : [];

  const notebookTitle = useMemo(() => {
    if (!selectedSources.length) return 'Notebook';
    if (selectedSources.length === 1) {
      return String(selectedSources[0].name || 'Notebook').replace(/\.[^.]+$/, '');
    }
    return 'Multi-source notebook';
  }, [selectedSources]);

  const noSources = !chunks.length;
  const hasSelectedSources = selectedSources.length > 0;
  const busy = isBusy || localLoading;

  const runSection = async (key, cb, setter) => {
    setErrors((e) => ({ ...e, [key]: '' }));
    setLocalLoading(key);
    try {
      const result = await cb();
      setter(result);
      return result;
    } catch (err) {
      const msg = err?.message || 'Request failed';
      setErrors((e) => ({ ...e, [key]: msg }));
      onError?.(msg);
      setter(null);
      return null;
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

  const addWebSource = async () => {
    const url = String(webUrl || '').trim();
    if (!url || !onAddWebSource || busy) return;
    setErrors((e) => ({ ...e, webIngest: '' }));
    setLocalLoading('webIngest');
    try {
      const result = await onAddWebSource(url);
      if (result?.ok === false) {
        setErrors((e) => ({ ...e, webIngest: result?.error || 'Could not ingest URL.' }));
        return;
      }
      setWebUrl('');
    } catch (err) {
      setErrors((e) => ({ ...e, webIngest: err?.message || 'Could not ingest URL.' }));
    } finally {
      setLocalLoading(null);
    }
  };

  return (
    <section className="panel overflow-hidden rounded-2xl p-0 shadow-sm" onMouseUp={handleSelection}>
      <div className="grid min-h-[min(78vh,860px)] grid-cols-1 lg:grid-cols-[minmax(260px,300px)_1fr]">
        {/* Sources — left column (NotebookLM-style, light theme) */}
        <aside className="flex flex-col border-b border-slate-200 bg-slate-50/95 lg:min-h-0 lg:border-b-0 lg:border-r lg:border-slate-200">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Sources <span className="font-normal text-muted">· up to 5</span>
            </h3>
          </div>

          <div className="border-b border-slate-200 px-3 py-2">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 transition hover:border-canvas-primary/40 hover:bg-slate-50"
              onClick={() => onOpenIngest?.()}
            >
              <Plus className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              Add sources
            </button>
            <div className="mt-2 flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <input
                type="search"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="Paste a URL to ingest this page"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addWebSource();
                  }
                }}
                title={studentId ? 'Paste a URL and press Enter to ingest' : 'Sign in to ingest web sources to your account'}
              />
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                disabled={busy || localLoading === 'webIngest' || !webUrl.trim() || !onAddWebSource}
                onClick={() => void addWebSource()}
              >
                {localLoading === 'webIngest' ? '…' : 'Add'}
              </button>
            </div>
            {errBox('webIngest')}
          </div>

          {conceptMapData?.nodes?.length ? (
            <details className="group border-b border-slate-200 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-medium text-slate-600 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="underline decoration-slate-300 underline-offset-2 group-open:no-underline">Mind map</span>
                <span className="text-muted"> (from Mind Map tab)</span>
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {conceptMapData.nodes.slice(0, 8).map((n) => (
                  <span
                    key={n.id}
                    className="rounded-full border border-indigo-200/80 bg-indigo-50/80 px-2 py-0.5 text-[11px] text-indigo-700"
                  >
                    {n.label}
                  </span>
                ))}
              </div>
            </details>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
            {!chunks.length ? (
              <p className="text-xs text-muted">No sources yet. Use Add sources or open the Ingest tab.</p>
            ) : (
              <>
                <label className="mb-2 flex cursor-pointer items-center gap-2 pb-2 text-xs text-slate-700">
                  <input type="checkbox" className="rounded border-border" checked={allSelected} onChange={toggleSelectAll} disabled={busy} />
                  <span>Select all (up to 5)</span>
                </label>
                <ul className="max-h-[min(42vh,360px)] space-y-1 overflow-y-auto pr-0.5 lg:max-h-none lg:flex-1">
                  {chunks.map((c) => {
                    const checked = selectedChunkIds.includes(c.id);
                    const Icon = sourceFileIcon(c.name);
                    return (
                      <li
                        key={c.id}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm leading-snug transition ${
                          checked ? 'bg-white ring-1 ring-canvas-primary/35' : 'hover:bg-white/70'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-slate-800" title={c.name}>
                          {c.name}
                        </span>
                        <input
                          type="checkbox"
                          className="shrink-0 rounded border-border"
                          checked={checked}
                          disabled={busy || (!checked && selectedChunkIds.length >= 5)}
                          onChange={() => toggleChunk(c.id)}
                          aria-label={`Include ${c.name}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </aside>

        {/* Chat — right column */}
        <div className="flex min-h-[420px] min-h-0 flex-col bg-white">
          <header className="border-b border-slate-200 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chat</p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
              <h2 className="max-w-[min(100%,28rem)] text-lg font-semibold leading-snug text-slate-900 md:text-xl">{notebookTitle}</h2>
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {selectedSources.length} source{selectedSources.length === 1 ? '' : 's'}
              </span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {!latestOutput && !question.trim() ? (
              <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
                <p className="text-sm text-slate-600">Ask a question grounded in your selected sources.</p>
                <p className="mt-1 text-xs text-muted">Answers include citations when available.</p>
              </div>
            ) : null}

            {latestOutput ? (
              <div className="mx-auto max-w-2xl">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {OUTPUT_KIND_LABEL[latestOutput.kind] || 'Output'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {latestOutput.kind === 'chat' ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          const t = String(latestOutput.data?.answer || '');
                          if (t && navigator.clipboard?.writeText) navigator.clipboard.writeText(t);
                        }}
                      >
                        Copy
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm">
                  <NotebookOutputBody
                    kind={latestOutput.kind}
                    data={latestOutput.data}
                    onCitationSelect={onCitationSelect}
                    ttsVoices={ttsVoices}
                    ttsVoiceUri={ttsVoiceUri}
                    setTtsVoiceUri={setTtsVoiceUri}
                    ttsSpeaking={ttsSpeaking}
                    stopTts={stopTts}
                    playTts={playTts}
                  />
                </div>
              </div>
            ) : null}

            {errBox('chat')}
            {errBox('summary')}
            {errBox('studyGuide')}
            {errBox('compare')}
            {errBox('audio')}
            {errBox('research')}
            {errBox('cornell')}
            {errBox('anki')}
            {errBox('storyboard')}
            {errBox('bottlenecks')}
            {errBox('socratic')}

            {olderOutputs.length > 0 ? (
              <details className="mx-auto mt-4 max-w-2xl rounded-xl border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">View history ({olderOutputs.length})</summary>
                <ul className="mt-2 space-y-3 border-t border-slate-100 pt-2">
                  {[...olderOutputs].reverse().map((entry) => (
                    <li key={`${entry.kind}-${entry.at}`} className="rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs">
                      <p className="mb-1 text-[10px] font-medium uppercase text-muted">{OUTPUT_KIND_LABEL[entry.kind] || entry.kind}</p>
                      <NotebookOutputBody
                        kind={entry.kind}
                        data={entry.data}
                        onCitationSelect={onCitationSelect}
                        ttsVoices={ttsVoices}
                        ttsVoiceUri={ttsVoiceUri}
                        setTtsVoiceUri={setTtsVoiceUri}
                        ttsSpeaking={ttsSpeaking}
                        stopTts={stopTts}
                        playTts={playTts}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {suggestedPrompts.length > 0 && hasSelectedSources ? (
              <div className="mx-auto mt-6 max-w-2xl space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-medium text-muted">Suggestions</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {suggestedPrompts.map((p) => (
                      <button key={p} type="button" className={CHIP} disabled={busy} onClick={() => setQuestion(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-medium text-muted">Study outputs</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources}
                      onClick={async () => {
                        const r = await runSection('summary', () => onSummary({ sources: selectedSources }), discard);
                        if (r) pushOutput('summary', r);
                      }}
                    >
                      {localLoading === 'summary' ? '…' : 'Summary'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources}
                      onClick={async () => {
                        const r = await runSection('studyGuide', () => onStudyGuide({ sources: selectedSources }), discard);
                        if (r) pushOutput('studyGuide', r);
                      }}
                    >
                      {localLoading === 'studyGuide' ? '…' : 'Study guide'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || selectedSources.length < 2}
                      onClick={async () => {
                        const r = await runSection('compare', () => onCompare({ sources: selectedSources }), discard);
                        if (r) pushOutput('compare', r);
                      }}
                    >
                      {localLoading === 'compare' ? '…' : 'Compare'}
                    </button>
                    <button type="button" className={CHIP} disabled={busy} onClick={() => setQuestion(EXAM_QUESTION_PROMPT)}>
                      Exam question
                    </button>
                  </div>
                </div>
                <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-800">More tools</summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources}
                      onClick={async () => {
                        const r = await runSection('audio', () => onAudioOverview({ sources: selectedSources }), discard);
                        if (r) pushOutput('audio', r);
                      }}
                    >
                      {localLoading === 'audio' ? '…' : 'Audio overview'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || !hasSelectedSources || !onResearchSynthesis}
                      onClick={async () => {
                        const r = await runSection(
                          'research',
                          () =>
                            onResearchSynthesis?.({
                              sources: selectedSources,
                              question: question.trim(),
                            }),
                          discard,
                        );
                        if (r) pushOutput('research', r);
                      }}
                    >
                      {localLoading === 'research' ? '…' : 'Research synthesis'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || !hasSelectedSources || !onCornellNotes}
                      onClick={async () => {
                        const r = await runSection('cornell', () => onCornellNotes?.({ sources: selectedSources }), discard);
                        if (r) pushOutput('cornell', r);
                      }}
                    >
                      {localLoading === 'cornell' ? '…' : 'Cornell notes'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || !hasSelectedSources || !onStoryboardPresentation}
                      onClick={async () => {
                        const r = await runSection(
                          'storyboard',
                          () =>
                            onStoryboardPresentation?.({
                              sources: selectedSources,
                              topic: question.trim(),
                              promptText: 'Storyboard: rule of three, one ELI5 slide, grounded in sources.',
                            }),
                          discard,
                        );
                        if (r?.slides?.length) pushOutput('storyboard', { title: r.title, slideCount: r.slides.length });
                      }}
                    >
                      {localLoading === 'storyboard' ? '…' : 'Storyboard deck'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources || !onAnkiCards}
                      onClick={async () => {
                        const r = await runSection('anki', () => onAnkiCards?.({ sources: selectedSources }), () => {});
                        if (r !== null) pushOutput('anki', { ok: true });
                      }}
                    >
                      {localLoading === 'anki' ? '…' : 'Anki deck'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources || !onDocumentBottlenecks}
                      onClick={async () => {
                        const r = await runSection(
                          'bottlenecks',
                          async () => {
                            const res = await onDocumentBottlenecks?.({ sources: selectedSources });
                            if (res?.bottlenecks) setBottlenecks(res.bottlenecks);
                            return res;
                          },
                          () => {},
                        );
                        if (r?.bottlenecks?.length) pushOutput('bottlenecks', r);
                      }}
                    >
                      {localLoading === 'bottlenecks' ? '…' : 'Analyze bottlenecks'}
                    </button>
                    <button
                      type="button"
                      className={CHIP}
                      disabled={busy || noSources || !onSocraticTutor}
                      onClick={async () => {
                        const r = await runSection(
                          'socratic',
                          () =>
                            onSocraticTutor?.({
                              sources: selectedSources,
                              prompt: question.trim() || 'Ask me a Socratic challenge based on these sources.',
                              bottlenecks: bottlenecks || [],
                            }),
                          discard,
                        );
                        if (r) pushOutput('socratic', r);
                      }}
                    >
                      {localLoading === 'socratic' ? '…' : 'Socratic chat'}
                    </button>
                  </div>
                </details>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3">
            <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Question</span>
                <textarea
                  className="input min-h-[3rem] w-full resize-none rounded-xl border-slate-200 py-2.5 text-sm shadow-sm"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Start typing…"
                  rows={2}
                />
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 shadow-sm"
                  disabled={busy || noSources || !question.trim()}
                  title="Send"
                  aria-label="Send question"
                  onClick={async () => {
                    const r = await runSection('chat', () => onSourceChat({ question, sources: selectedSources }), () => {});
                    if (r) pushOutput('chat', r);
                  }}
                >
                  {localLoading === 'chat' ? '…' : '→'}
                </button>
              </div>
            </div>
          </div>
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
