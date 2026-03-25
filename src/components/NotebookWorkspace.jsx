import { useCallback, useEffect, useMemo, useState } from 'react';

const TTS_VOICE_STORAGE_KEY = 'sa-notebook-tts-voice-uri';

export default function NotebookWorkspace({
  chunks,
  activePdfId = '',
  studentId = '',
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

      <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
        <p className="mb-2 text-xs font-semibold text-indigo-900">Study modes</p>
        <p className="mb-2 text-[11px] text-indigo-800/90">
          Structured outputs from your selected sources
          {studentId && selectedSources.some((s) => s.sourceId) ? ' (RAG on when source IDs are present).' : ''}
        </p>
        <input
          className="input mb-2 py-1.5 text-sm"
          value={studyTopic}
          onChange={(e) => setStudyTopic(e.target.value)}
          placeholder="Topic label (e.g. for storyboard deck)"
        />
        <textarea
          className="input mb-2 min-h-14 py-1.5 text-sm"
          value={researchQuestion}
          onChange={(e) => setResearchQuestion(e.target.value)}
          placeholder="Optional focus question for research map / synthesis"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || noSources || !onResearchSynthesis}
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
            disabled={busy || noSources || !onCornellNotes}
            onClick={async () => runSection('cornell', () => onCornellNotes?.({ sources: selectedSources }), setCornellNotes)}
          >
            {localLoading === 'cornell' ? '…' : 'Cornell notes'}
          </button>
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
            className="btn-primary !px-2 !py-1 text-xs"
            disabled={busy || noSources || !onStoryboardPresentation}
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
        <div className="mt-3 rounded-lg border border-indigo-100 bg-white/90 p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-700">Socratic chat</p>
          <textarea
            className="input mb-1 min-h-16 py-1.5 text-sm"
            value={socraticQuestion}
            onChange={(e) => setSocraticQuestion(e.target.value)}
            placeholder="Ask a question — uses bottlenecks if you analyzed them first."
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
          <div className="mt-2 max-h-48 overflow-auto rounded border border-border bg-white p-2 text-[11px]">
            <p className="font-semibold text-slate-800">Research synthesis</p>
            <p className="mt-1 text-slate-700">{researchSynth.answer}</p>
          </div>
        ) : null}
        {cornellNotes?.sections?.length ? (
          <div className="mt-2 max-h-40 overflow-auto rounded border border-border bg-white p-2 text-[11px]">
            <p className="font-semibold text-slate-800">Cornell notes</p>
            {cornellNotes.sections.slice(0, 2).map((s, i) => (
              <div key={`cn-${i}`} className="mt-1 border-t border-slate-100 pt-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted">{s.summary}</p>
              </div>
            ))}
          </div>
        ) : null}
        {bottlenecks?.length ? (
          <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
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

      <div className="rounded-xl border border-border bg-white p-4">
        <p className="mb-2 text-sm font-semibold">Source-grounded chat</p>
        <textarea
          className="input min-h-56 w-full"
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
            <p className="text-sm leading-relaxed">{chatResult.answer}</p>
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
                    {c.passageId ? <p className="text-[10px] text-slate-500">Passage: {c.passageId}</p> : null}
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
