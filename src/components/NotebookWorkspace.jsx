import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileImage, FileSpreadsheet, FileText, Plus, Search } from 'lucide-react';

const TTS_VOICE_STORAGE_KEY = 'sa-notebook-tts-voice-uri';

function sourceFileIcon(name) {
  const n = String(name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(n)) return FileImage;
  if (/\.(xlsx?|csv)$/i.test(n)) return FileSpreadsheet;
  return FileText;
}

export default function NotebookWorkspace({
  chunks,
  activePdfId = '',
  studentId = '',
  onOpenIngest,
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
    research: '',
    cornell: '',
    anki: '',
    storyboard: '',
    bottlenecks: '',
    socratic: '',
  });
  const [studyTopic, setStudyTopic] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [socraticQuestion, setSocraticQuestion] = useState('');
  const [bottlenecks, setBottlenecks] = useState(null);
  const [researchSynth, setResearchSynth] = useState(null);
  const [cornellNotes, setCornellNotes] = useState(null);
  const [storyboardPreview, setStoryboardPreview] = useState(null);
  const [socraticTurn, setSocraticTurn] = useState(null);
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
    out.push(
      'How do the key ideas in these sources connect?',
      'What should I review first based on difficulty?',
      'Give me one exam-style question grounded in these sources.',
    );
    return out.slice(0, 5);
  }, [selectedSources]);

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
    <section className="panel overflow-hidden rounded-2xl p-0 shadow-sm" onMouseUp={handleSelection}>
      <div className="grid min-h-[min(78vh,860px)] grid-cols-1 lg:grid-cols-[minmax(260px,300px)_1fr]">
        {/* Sources — left column (NotebookLM-style, light theme) */}
        <aside className="flex flex-col border-b border-slate-200 bg-slate-50/95 lg:min-h-0 lg:border-b-0 lg:border-r lg:border-slate-200">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Sources</h3>
              <p className="mt-0.5 text-[11px] text-muted">Up to 5 for chat & tools.</p>
            </div>
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
                readOnly
                className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-[11px] text-slate-500 outline-none placeholder:text-slate-400"
                placeholder="Search the web for new sources (coming soon)"
                title="Use Ingest to add PDFs and files for now"
              />
            </div>
          </div>

          {conceptMapData?.nodes?.length ? (
            <details className="border-b border-slate-200 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted">Mind map preview</summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {conceptMapData.nodes.slice(0, 6).map((n) => (
                  <span
                    key={n.id}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700"
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
                <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-slate-200/80 pb-2 text-xs text-slate-700">
                  <input type="checkbox" className="rounded border-border" checked={allSelected} onChange={toggleSelectAll} disabled={busy} />
                  <span>Select all sources (up to 5)</span>
                </label>
                <ul className="max-h-[min(42vh,360px)] space-y-1.5 overflow-y-auto pr-0.5 lg:max-h-none lg:flex-1">
                  {chunks.map((c) => {
                    const checked = selectedChunkIds.includes(c.id);
                    const Icon = sourceFileIcon(c.name);
                    return (
                      <li
                        key={c.id}
                        className={`flex items-start gap-2 rounded-xl border px-2 py-1.5 text-sm leading-snug transition ${
                          checked ? 'border-canvas-primary/40 bg-white shadow-sm' : 'border-transparent bg-transparent hover:bg-white/80'
                        }`}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-800" title={c.name}>
                          {c.name}
                        </span>
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0 rounded border-border"
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
            {!chatResult && !question.trim() ? (
              <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
                <p className="text-sm text-slate-600">Ask a question grounded in your selected sources.</p>
                <p className="mt-1 text-xs text-muted">Answers include citations when available.</p>
              </div>
            ) : null}

            {chatResult ? (
              <div className="mx-auto max-w-2xl">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-muted">{selectedSources.length} sources</p>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                      const t = String(chatResult.answer || '');
                      if (t && navigator.clipboard?.writeText) navigator.clipboard.writeText(t);
                    }}
                  >
                    Copy answer
                  </button>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm">
                  <p className="text-sm leading-relaxed text-slate-800">{chatResult.answer}</p>
                  <ul className="mt-3 space-y-1.5">
                    {(chatResult.citations || []).map((c, i) => (
                      <li key={`c-${i}`} className="rounded-xl border border-slate-200 bg-white p-2 text-xs">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => onCitationSelect?.(c)}
                          title="Jump to citation source"
                        >
                          <p className="font-semibold underline decoration-dotted">{c.source}</p>
                          {c.passageId ? <p className="text-[10px] text-slate-500">Passage: {c.passageId}</p> : null}
                          <p className="text-muted">{c.excerpt}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {errBox('chat')}

            {suggestedPrompts.length > 0 && hasSelectedSources ? (
              <div className="mx-auto mt-6 max-w-2xl">
                <p className="mb-2 text-[11px] font-medium text-muted">Suggested questions</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {suggestedPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-snug text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50"
                      disabled={busy}
                      onClick={() => setQuestion(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3">
            <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Question</span>
                <textarea
                  className="input min-h-[3rem] w-full resize-none rounded-2xl border-slate-200 py-2.5 text-sm shadow-sm"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Start typing…"
                  rows={2}
                />
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden text-xs text-muted sm:inline">{selectedSources.length} sources</span>
                <button
                  type="button"
                  className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 shadow-sm"
                  disabled={busy || noSources || !question.trim()}
                  title="Send"
                  aria-label="Send question"
                  onClick={async () =>
                    runSection('chat', () => onSourceChat({ question, sources: selectedSources }), setChatResult)
                  }
                >
                  {localLoading === 'chat' ? '…' : '→'}
                </button>
              </div>
            </div>
          </div>

      <div className="max-h-[min(48vh,520px)] overflow-y-auto border-t border-slate-200 bg-slate-50/50 px-3 py-3 lg:max-h-none lg:overflow-visible">
      <div className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5">
        <p className="mb-1.5 text-xs font-semibold text-indigo-900">Actions</p>
        <details className="mb-2 rounded-lg border border-indigo-100 bg-white/90 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Options (storyboard topic, research focus)</summary>
          <input
            className="input mb-1.5 mt-2 py-1.5 text-sm"
            value={studyTopic}
            onChange={(e) => setStudyTopic(e.target.value)}
            placeholder="Storyboard topic label (optional)"
          />
          <textarea
            className="input min-h-12 py-1.5 text-sm"
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            placeholder="Research / synthesis focus question (optional)"
          />
        </details>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || !hasSelectedSources || !onResearchSynthesis}
            title={
              busy
                ? 'Working…'
                : !hasSelectedSources
                  ? 'Select at least one source PDF.'
                  : undefined
            }
            onClick={async () =>
              runSection(
                'research',
                () =>
                  onResearchSynthesis?.({
                    sources: selectedSources,
                    question: researchQuestion.trim(),
                  }),
                setResearchSynth,
              )
            }
          >
            {localLoading === 'research' ? '…' : 'Research map'}
          </button>
          <button
            type="button"
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || !hasSelectedSources || !onCornellNotes}
            title={
              busy
                ? 'Working…'
                : !hasSelectedSources
                  ? 'Select at least one source PDF.'
                  : undefined
            }
            onClick={async () => runSection('cornell', () => onCornellNotes?.({ sources: selectedSources }), setCornellNotes)}
          >
            {localLoading === 'cornell' ? '…' : 'Cornell notes'}
          </button>
          <button
            type="button"
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || !hasSelectedSources || !onStoryboardPresentation}
            title={
              busy
                ? 'Working…'
                : !hasSelectedSources
                  ? 'Select at least one source PDF.'
                  : undefined
            }
            onClick={async () =>
              runSection(
                'storyboard',
                () =>
                  onStoryboardPresentation?.({
                    sources: selectedSources,
                    topic: studyTopic.trim(),
                    promptText: 'Storyboard: rule of three, one ELI5 slide, grounded in sources.',
                  }),
                setStoryboardPreview,
              )
            }
          >
            {localLoading === 'storyboard' ? '…' : 'Storyboard deck'}
          </button>
        </div>
        <details className="mt-1.5 rounded-lg border border-indigo-100 bg-white/90 p-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">Advanced</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary !px-2 !py-1 text-xs"
              disabled={busy || noSources || !onAnkiCards}
              onClick={async () => runSection('anki', () => onAnkiCards?.({ sources: selectedSources }), () => null)}
            >
              {localLoading === 'anki' ? '…' : 'Anki deck'}
            </button>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-xs"
              disabled={busy || noSources || !onDocumentBottlenecks}
              onClick={async () =>
                runSection(
                  'bottlenecks',
                  async () => {
                    const r = await onDocumentBottlenecks?.({ sources: selectedSources });
                    if (r?.bottlenecks) setBottlenecks(r.bottlenecks);
                    return r;
                  },
                  () => null,
                )
              }
            >
              {localLoading === 'bottlenecks' ? '…' : 'Analyze bottlenecks'}
            </button>
          </div>
        </details>
        <div className="mt-1.5 rounded-lg border border-indigo-100 bg-white/90 p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-700">Socratic</p>
          <textarea
            className="input mb-1 min-h-12 py-1.5 text-sm"
            value={socraticQuestion}
            onChange={(e) => setSocraticQuestion(e.target.value)}
            title="Uses bottleneck analysis if you ran it first"
            placeholder="Question (optional: run bottlenecks first)"
          />
          <button
            type="button"
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || noSources || !socraticQuestion.trim() || !onSocraticTutor}
            onClick={async () =>
              runSection(
                'socratic',
                () =>
                  onSocraticTutor?.({
                    sources: selectedSources,
                    prompt: socraticQuestion.trim(),
                    bottlenecks: bottlenecks || [],
                  }),
                setSocraticTurn,
              )
            }
          >
            {localLoading === 'socratic' ? '…' : 'Socratic chat'}
          </button>
        </div>
        {errBox('research')}
        {errBox('cornell')}
        {errBox('anki')}
        {errBox('storyboard')}
        {errBox('bottlenecks')}
        {errBox('socratic')}
        {researchSynth ? (
          <details className="mt-2 rounded border border-border bg-white p-2 text-[11px]" open>
            <summary className="cursor-pointer font-semibold text-slate-800">Research synthesis</summary>
            <div className="mt-1 max-h-48 overflow-auto">
              <p className="text-slate-700">{researchSynth.answer}</p>
            </div>
          </details>
        ) : null}
        {cornellNotes?.sections?.length ? (
          <details className="mt-2 rounded border border-border bg-white p-2 text-[11px]">
            <summary className="cursor-pointer font-semibold text-slate-800">Cornell notes</summary>
            <div className="mt-1 max-h-40 overflow-auto">
              {cornellNotes.sections.slice(0, 2).map((s, i) => (
                <div key={`cn-${i}`} className="mt-1 border-t border-slate-100 pt-1">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-muted">{s.summary}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {bottlenecks?.length ? (
          <details className="mt-2 rounded border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-slate-700">
            <summary className="cursor-pointer font-semibold">Bottlenecks</summary>
            <ul className="mt-1 space-y-1">
              {bottlenecks.map((b, i) => (
                <li key={`bn-${i}`} className="rounded border border-amber-200 bg-amber-50/80 px-2 py-1">
                  <span className="font-semibold">{b.concept}</span>
                  {b.complexityScore != null ? (
                    <span className="text-muted"> · difficulty {b.complexityScore}/10</span>
                  ) : null}
                  : {b.whyHard}
                  {b.complexityNote ? <span className="mt-0.5 block text-muted">{b.complexityNote}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {storyboardPreview?.slides?.length ? (
          <p className="mt-2 text-[11px] text-slate-600">
            Storyboard saved: {storyboardPreview.title} ({storyboardPreview.slides.length} slides). Open the Presentations tab to preview.
          </p>
        ) : null}
        {socraticTurn ? (
          <div className="mt-2 rounded border border-border bg-white p-2 text-[11px]">
            <p className="text-slate-800">{socraticTurn.reply}</p>
            <p className="mt-1 font-medium text-indigo-800">Challenge: {socraticTurn.challengeQuestion}</p>
          </div>
        ) : null}
      </div>

      <details className="mt-2 rounded-lg border border-border bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">Study outputs</summary>
        <div className="mt-2 space-y-2">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-slate-50/50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
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

        <div className="rounded-lg border border-border bg-slate-50/50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
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

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-slate-50/50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm font-semibold">Compare</p>
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

        <div className="rounded-lg border border-border bg-slate-50/50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
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
              <p className="text-[11px] leading-snug text-muted" title="Script from Ollama; voice is browser TTS">
                Script from model · voice = browser TTS
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
        </div>
      </details>
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
