import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import AppShell from './components/AppShell';
import UploadCard from './components/UploadCard';
import FlashcardDeck from './components/FlashcardDeck';
import SubirArchivoPanel from './components/SubirArchivoPanel';
import TablaApartados from './components/TablaApartados';
const GraficasProgreso = lazy(() => import('./components/GraficasProgreso'));
const SesionEstudio = lazy(() => import('./components/SesionEstudio'));
const ConceptMap = lazy(() => import('./components/ConceptMap'));

ChartJS.register(ArcElement, BarElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const tabs = ['Ingest', 'Flashcards', 'Concept Map', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor'];

function cleanAcademicText(raw) {
  return (raw || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function looksLikeGibberish(text) {
  if (!text) return true;
  const sample = text.slice(0, 2000);
  const weird = (sample.match(/[<>{}[\]\\/|~`]/g) || []).length;
  const alpha = (sample.match(/[A-Za-z]/g) || []).length;
  return alpha < 80 || weird / Math.max(sample.length, 1) > 0.1;
}

function fallbackCardsFromText(raw) {
  const cleaned = cleanAcademicText(raw);
  const completeSentences = cleaned.match(/[^.!?]+[.!?]/g) || [];
  return completeSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 45 && s.length < 260)
    .slice(0, 12)
    .map((text, i) => ({
      id: `${Date.now()}-${i}`,
      question: `What is the key idea of this statement?`,
      answer: text,
      right: 0,
      wrong: 0,
    }));
}

async function generateCardsWithOllama(text) {
  const resp = await fetchWithTimeout('/api/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }, 35000);
  if (!resp.ok) throw new Error('Ollama API error');
  const data = await resp.json();
  return Array.isArray(data.cards) ? data.cards : [];
}

async function generateSectionsWithOllama({ text, title }) {
  const resp = await fetchWithTimeout('/api/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title }),
  }, 35000);
  if (!resp.ok) throw new Error('Sections API error');
  const data = await resp.json();
  return Array.isArray(data.apartados) ? data.apartados : [];
}

async function generatePresentationWithOllama({ topic, promptText, sources = [], slides = 8 }) {
  const resp = await fetchWithTimeout('/api/presentation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, promptText, sources, slides }),
  }, 45000);
  if (!resp.ok) throw new Error('Presentation API error');
  const data = await resp.json();
  return {
    title: String(data.title || topic).trim(),
    slides: Array.isArray(data.slides) ? data.slides : [],
    references: Array.isArray(data.references) ? data.references : [],
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Request timed out.');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildFallbackPresentation(topic, promptText, sourceNames = []) {
  const cleanedPrompt = cleanAcademicText(promptText || '');
  const promptLines = cleanedPrompt
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
  const chunks = [];
  for (let i = 0; i < promptLines.length; i += 3) {
    chunks.push(promptLines.slice(i, i + 3));
  }
  const defaultSlides = [
    ['Define the topic scope', 'Explain relevance in university context', 'State presentation objectives'],
    ['Main concept and key terms', 'How the concept works', 'Typical real-world use'],
    ['Core methods or process', 'Step-by-step flow', 'Important constraints'],
    ['Benefits and limitations', 'Common mistakes', 'How to avoid them'],
    ['Conclusion and recap', 'Actionable next steps', 'Short Q&A prompts'],
  ];

  const slides = (chunks.length ? chunks : defaultSlides).map((bullets, idx) => ({
    title: idx === 0 ? 'Introduction' : `Section ${idx + 1}`,
    bullets: bullets.slice(0, 5),
    notes: `Keep this section focused on ${topic}.`,
    imageSuggestion: `Simple visual for ${topic} - ${idx === 0 ? 'overview' : `section ${idx + 1}`}.`,
    graphSuggestion: idx % 2 === 0 ? `Comparison chart for key metrics in section ${idx + 1}.` : '',
  }));

  return {
    title: topic || 'Generated Presentation',
    slides,
    references: sourceNames.slice(0, 5).map((name) => ({
      text: `Uploaded source: ${name}`,
      url: '',
    })),
  };
}

function slideCountLabel(count) {
  const n = Number(count) || 0;
  return `${n} slide${n === 1 ? '' : 's'}`;
}

function imagePlaceholderFromSuggestion(text) {
  const safe = String(text || 'Presentation visual').slice(0, 90);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#dbeafe'/><stop offset='1' stop-color='#bfdbfe'/></linearGradient></defs>
  <rect width='100%' height='100%' fill='url(#g)'/>
  <rect x='40' y='40' width='1200' height='640' rx='18' fill='white' fill-opacity='0.65'/>
  <text x='80' y='120' font-family='Inter, Arial, sans-serif' font-size='38' fill='#1e3a8a'>Image concept</text>
  <text x='80' y='180' font-family='Inter, Arial, sans-serif' font-size='28' fill='#1f2937'>${safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildSlideGraphData(slide) {
  const labels = (slide?.bullets || []).slice(0, 5).map((b, i) => {
    const short = String(b).split(' ').slice(0, 3).join(' ');
    return short || `Point ${i + 1}`;
  });
  const values = (slide?.bullets || []).slice(0, 5).map((b, i) => {
    const words = String(b).split(/\s+/).filter(Boolean).length;
    return Math.max(2, Math.min(12, words + i));
  });
  return {
    labels: labels.length ? labels : ['Point 1', 'Point 2', 'Point 3'],
    datasets: [
      {
        label: 'Relative emphasis',
        data: values.length ? values : [4, 6, 5],
        backgroundColor: 'rgba(37,99,235,0.45)',
        borderColor: '#2563eb',
        borderWidth: 1,
      },
    ],
  };
}

function normalizeStudyCards(cardsInput) {
  return (cardsInput || []).map((c, i) => ({
    ...c,
    id: c.id || `${Date.now()}-${i}`,
    question: c.question || c.frente || 'Question',
    answer: c.answer || c.atras || '',
    tema: c.tema || 'General',
    dificultad: c.dificultad || 'media',
    proxima_revision: c.proxima_revision || new Date().toISOString().split('T')[0],
    intervalo_dias: Number(c.intervalo_dias || 1),
    veces_bien: Number(c.veces_bien || 0),
    veces_mal: Number(c.veces_mal || 0),
  }));
}

async function extractPdfText(file, onProgress) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  let allText = '';
  const totalPages = Math.max(pdf.numPages, 1);
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const p = await pdf.getPage(page);
    const content = await p.getTextContent();
    let pageText = '';
    let lastY = null;
    for (const item of content.items) {
      const str = item.str || '';
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) pageText += '\n';
      else if (pageText && !pageText.endsWith('\n')) pageText += ' ';
      pageText += str;
      lastY = y;
    }
    allText += `${pageText}\n`;
    if (onProgress) {
      onProgress({
        phase: 'extract',
        progress: Math.round((page / totalPages) * 100),
        label: `Reading PDF page ${page} of ${totalPages}...`,
      });
    }
  }
  return allText;
}

async function fileToText(file, onProgress) {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return extractPdfText(file, onProgress);
  const buffer = await file.arrayBuffer();
  if (ext === 'txt' || ext === 'md' || ext === 'csv') return new TextDecoder().decode(buffer);
  return '';
}

export default function App() {
  const [tab, setTab] = useState('Ingest');
  const [chunks, setChunks] = useState([]);
  const [cards, setCards] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [messages, setMessages] = useState([]);
  const [room, setRoom] = useState('global');
  const [presentations, setPresentations] = useState([]);
  const [apartados, setApartados] = useState([]);
  const [grades, setGrades] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPresentation, setIsGeneratingPresentation] = useState(false);
  const [latestBatchAt, setLatestBatchAt] = useState(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState('');
  const [generationIndeterminate, setGenerationIndeterminate] = useState(false);
  const [isAnalyzingSections, setIsAnalyzingSections] = useState(false);
  const [studyMode, setStudyMode] = useState(null);
  const [modelStatus, setModelStatus] = useState({ ok: false, model: 'qwen2.5:7b' });
  const [quizConfig, setQuizConfig] = useState({ mode: 'quiz', difficulty: 'medium', count: 10 });

  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        if (mounted) setModelStatus({ ok: !!data.ok, model: data.model || 'qwen2.5:7b' });
      } catch {
        if (mounted) setModelStatus({ ok: false, model: 'qwen2.5:7b' });
      }
    };
    ping();
    const id = setInterval(ping, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const avg = useMemo(() => {
    const w = grades.reduce((s, g) => s + g.weight, 0);
    if (!w) return 0;
    return grades.reduce((s, g) => s + g.score * g.weight, 0) / w;
  }, [grades]);

  const stats = useMemo(() => ({
    cardsCount: cards.length,
    tasksDone: tasks.filter((t) => t.done).length,
    tasksTotal: tasks.length,
    avg,
  }), [cards.length, tasks, avg]);

  const generateForChunk = async (chunk, { append = false } = {}) => {
    if (!chunk?.content?.trim()) {
      setNotice('No readable content found for flashcard generation.');
      return;
    }
    setIsGenerating(true);
    setGenerationProgress(100);
    setGenerationIndeterminate(true);
    setGenerationStage('AI is generating flashcards...');
    setNotice('Generating your study set...');
    try {
      const aiCards = await generateCardsWithOllama(chunk.content);
      if (aiCards.length) {
        const normalized = normalizeStudyCards(aiCards);
        setCards((prev) => (append ? [...prev, ...normalized] : normalized));
        setLatestBatchAt(new Date().toLocaleTimeString());
        setShowAnswer(false);
        setGenerationIndeterminate(false);
        setGenerationProgress(100);
        setGenerationStage('Completed');
        setNotice(
          append
            ? `Generated ${aiCards.length} more AI flashcards.`
            : `Generated ${aiCards.length} AI flashcards.`,
        );
        return;
      }
      const fallback = fallbackCardsFromText(chunk.content);
      const normalizedFallback = normalizeStudyCards(fallback);
      setCards((prev) => (append ? [...prev, ...normalizedFallback] : normalizedFallback));
      setLatestBatchAt(new Date().toLocaleTimeString());
      setGenerationIndeterminate(false);
      setGenerationProgress(100);
      setGenerationStage('Completed');
      setNotice(
        append
          ? `AI returned no cards. Added ${fallback.length} backup flashcards.`
          : `AI returned no cards. Generated ${fallback.length} backup cards.`,
      );
    } catch (error) {
      setGenerationIndeterminate(true);
      setGenerationStage('AI unavailable, switching to backup mode...');
      const fallback = fallbackCardsFromText(chunk.content);
      const normalizedFallback = normalizeStudyCards(fallback);
      setCards((prev) => (append ? [...prev, ...normalizedFallback] : normalizedFallback));
      setLatestBatchAt(new Date().toLocaleTimeString());
      setGenerationIndeterminate(false);
      setGenerationProgress(100);
      setGenerationStage('Completed');
      setNotice(
        append
          ? `AI model offline — added ${fallback.length} backup cards.`
          : `${error?.message || 'AI model offline'} — using backup mode (${fallback.length} cards).`,
      );
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStage('');
        setGenerationIndeterminate(false);
      }, 900);
    }
  };

  const onFileUpload = async (file) => {
    if (!file) {
      setNotice('Please select a file first.');
      return;
    }
    setGenerationIndeterminate(false);
    setGenerationProgress(5);
    setGenerationStage('Uploading file...');
    try {
      const text = await fileToText(file, ({ progress, label }) => {
        setGenerationIndeterminate(false);
        setGenerationProgress(progress);
        setGenerationStage(label);
      });
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setGenerationProgress(100);
        setGenerationStage('Preparing extracted text...');
      }
      const cleaned = cleanAcademicText(text);
      if (!cleaned || looksLikeGibberish(cleaned)) {
        setNotice('Could not extract readable text. Use a text-based PDF/TXT.');
        setGenerationProgress(0);
        setGenerationStage('');
        return;
      }
      const chunk = { id: `${Date.now()}`, name: file.name, content: cleaned };
      setChunks((prev) => [chunk, ...prev]);
      await generateForChunk(chunk);
    } catch (error) {
      setNotice(`Upload failed: ${error?.message || 'Unknown error.'}`);
      setGenerationProgress(0);
      setGenerationStage('');
    }
  };

  const markCard = (ok) => {
    const currentCard = cards[0];
    if (!currentCard) return;
    setCards((prev) => {
      const [head, ...rest] = prev;
      const updated = { ...head, right: head.right + (ok ? 1 : 0), wrong: head.wrong + (!ok ? 1 : 0) };
      return ok ? [...rest, updated] : [updated, ...rest];
    });
    setShowAnswer(false);
  };

  const analyzeChunkSections = async (chunkId) => {
    const chunk = chunkId ? chunks.find((c) => c.id === chunkId) : chunks[0];
    if (!chunk) {
      setNotice('Upload a document first, then analyze sections.');
      return;
    }
    setIsAnalyzingSections(true);
    setNotice('Analyzing document structure...');
    try {
      const aiSections = await generateSectionsWithOllama({
        text: chunk.content,
        title: chunk.name.replace(/\.[^.]+$/, ''),
      });
      const normalized = aiSections.map((s, i) => ({
        id: s.id || `a${i + 1}`,
        nombre: s.nombre,
        descripcion: s.descripcion || '',
        porcentaje: 0,
        estado: 'pendiente',
        fechas_trabajo: [],
      }));
      setApartados(normalized);
      setNotice(`Extracted ${normalized.length} main sections.`);
    } catch (error) {
      const fallback = chunk.content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 20)
        .slice(0, 8)
        .map((line, i) => ({
          id: `a${i + 1}`,
          nombre: line.split(' ').slice(0, 6).join(' '),
          descripcion: line,
          porcentaje: 0,
          estado: 'pendiente',
          fechas_trabajo: [],
        }));
      setApartados(fallback);
      setNotice(`${error?.message || 'AI unavailable'}. Built ${fallback.length} backup sections.`);
    } finally {
      setIsAnalyzingSections(false);
    }
  };

  const generatePresentation = async ({ topic, promptText, chunkIds }) => {
    setIsGeneratingPresentation(true);
    setNotice('Generating your presentation...');
    const sourceChunks = (Array.isArray(chunkIds) && chunkIds.length)
      ? chunks.filter((c) => chunkIds.includes(c.id))
      : (chunks[0] ? [chunks[0]] : []);
    if (!sourceChunks.length) {
      setNotice('Upload a PDF first, then generate a presentation from it.');
      setIsGeneratingPresentation(false);
      return;
    }
    const resolvedTopic = topic || sourceChunks[0].name.replace(/\.[^.]+$/, '');
    const sources = sourceChunks.map((c) => ({ name: c.name, content: c.content }));
    try {
      const generated = await generatePresentationWithOllama({
        topic: resolvedTopic,
        promptText,
        sources,
        slides: 8,
      });
      if (generated.slides.length) {
        setPresentations((prev) => [{ id: Date.now(), ...generated }, ...prev]);
        setNotice(`Presentation generated: ${slideCountLabel(generated.slides.length)}.`);
        return;
      }
      const fallback = buildFallbackPresentation(resolvedTopic, promptText, sourceChunks.map((c) => c.name));
      setPresentations((prev) => [{ id: Date.now(), ...fallback }, ...prev]);
      setNotice(`AI returned no slides. Created backup outline (${slideCountLabel(fallback.slides.length)}).`);
    } catch (error) {
      const fallback = buildFallbackPresentation(resolvedTopic, promptText, sourceChunks.map((c) => c.name));
      setPresentations((prev) => [{ id: Date.now(), ...fallback }, ...prev]);
      setNotice(`${error?.message || 'AI model offline'} — generated backup outline (${slideCountLabel(fallback.slides.length)}).`);
    } finally {
      setIsGeneratingPresentation(false);
    }
  };

  const generateQuiz = () => {
    setQuizResults((prev) => [
      {
        id: Date.now(),
        topic: quizConfig.mode.toUpperCase(),
        total: Number(quizConfig.count),
        correct: Math.round(Number(quizConfig.count) * 0.75),
        sec: 120,
        difficulty: quizConfig.difficulty,
      },
      ...prev,
    ]);
  };

  const gradesChartData = useMemo(() => ({
    labels: grades.map((g) => g.subject).reverse(),
    datasets: [
      {
        label: 'Score',
        data: grades.map((g) => g.score).reverse(),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
      },
    ],
  }), [grades]);

  const requiredFinal = simulations[0]?.req ?? 0;
  const kpiData = useMemo(() => ({
    labels: ['Current Avg', 'Required Final'],
    datasets: [
      { data: [avg || 0, requiredFinal || 0], backgroundColor: ['#2563eb', '#10b981'] },
    ],
  }), [avg, requiredFinal]);

  return (
    <AppShell
      tabs={tabs}
      tab={tab}
      setTab={setTab}
      modelStatus={modelStatus}
      latestBatchAt={latestBatchAt}
      notice={notice}
      stats={stats}
    >
      {tab === 'Ingest' ? (
        <>
          <UploadCard
            onFile={onFileUpload}
            onGenerateLatest={() => chunks[0] && generateForChunk(chunks[0])}
            chunks={chunks}
            isGenerating={isGenerating}
            progress={generationProgress}
            progressLabel={generationStage}
            isIndeterminate={generationIndeterminate}
          />
          <SubirArchivoPanel
            chunks={chunks}
            apartados={apartados}
            setApartados={setApartados}
            isAnalyzing={isAnalyzingSections}
            onAnalizar={analyzeChunkSections}
          />
          <TablaApartados apartados={apartados} onUpdate={setApartados} />
        </>
      ) : null}

      {tab === 'Flashcards' ? (
        <>
          <FlashcardDeck
            cards={cards}
            showAnswer={showAnswer}
            setShowAnswer={setShowAnswer}
            onRight={() => markCard(true)}
            onWrong={() => markCard(false)}
            latestBatchAt={latestBatchAt}
            onGenerateMore={() => chunks[0] && generateForChunk(chunks[0], { append: true })}
            onClear={() => {
              setCards([]);
              setLatestBatchAt(null);
              setStudyMode(null);
            }}
          />
          {cards.length ? (
            <section className="panel mt-4">
              <h3 className="mb-3 text-lg font-semibold">Study Session (Spaced Repetition)</h3>
              {!studyMode ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => setStudyMode('all')}>Start full session</button>
                  <button className="btn-ghost" onClick={() => setStudyMode('review')}>Review difficult only</button>
                </div>
              ) : (
                <Suspense fallback={<section className="panel mt-2 text-sm text-muted">Loading study session...</section>}>
                  <SesionEstudio
                    tarjetas={cards}
                    soloRepaso={studyMode === 'review'}
                    onGuardar={(updates) =>
                      setCards((prev) =>
                        prev.map((c) => (updates[c.id] ? { ...c, ...updates[c.id] } : c)),
                      )
                    }
                    onVolver={() => setStudyMode(null)}
                  />
                </Suspense>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'Tasks' ? <Tasks tasks={tasks} setTasks={setTasks} /> : null}
      {tab === 'Quizzes' ? <Quizzes config={quizConfig} setConfig={setQuizConfig} onGenerate={generateQuiz} results={quizResults} /> : null}
      {tab === 'Chat' ? <Chat room={room} setRoom={setRoom} messages={messages} setMessages={setMessages} /> : null}
      {tab === 'Presentations' ? (
        <Presentations
          presentations={presentations}
          setPresentations={setPresentations}
          onGenerate={generatePresentation}
          isGenerating={isGeneratingPresentation}
          chunks={chunks}
        />
      ) : null}
      {tab === 'Concept Map' ? (
        <Suspense fallback={<section className="panel text-sm text-muted">Loading concept map...</section>}>
          <ConceptMap apartados={apartados} />
        </Suspense>
      ) : null}
      {tab === 'Academics' ? (
        <>
          <Academics
            grades={grades}
            setGrades={setGrades}
            simulations={simulations}
            setSimulations={setSimulations}
            avg={avg}
            gradesChartData={gradesChartData}
            kpiData={kpiData}
          />
          <Suspense fallback={<section className="panel mt-4 text-sm text-muted">Loading charts...</section>}>
            <GraficasProgreso apartados={apartados} />
          </Suspense>
        </>
      ) : null}
      {tab === 'AI Tutor' ? <AiTutor tutorMessages={tutorMessages} setTutorMessages={setTutorMessages} /> : null}
    </AppShell>
  );
}

function Tasks({ tasks, setTasks }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Daily Tasks</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option>low</option><option>medium</option><option>high</option>
        </select>
        <button className="btn-primary" onClick={() => { if (!title.trim()) return; setTasks([{ id: Date.now(), title, priority, done: false }, ...tasks]); setTitle(''); }}>Add task</button>
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={t.done} onChange={() => setTasks(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} />
              <span>{t.title}</span>
              <span className="ml-auto text-xs text-muted">{t.priority}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Quizzes({ config, setConfig, onGenerate, results }) {
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Quiz / Exam Generator</h3>
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <select className="input" value={config.mode} onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value }))}>
          <option value="quiz">Quiz</option>
          <option value="exam">Exam</option>
          <option value="test">Test</option>
        </select>
        <select className="input" value={config.difficulty} onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value }))}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <input className="input" type="number" value={config.count} onChange={(e) => setConfig((c) => ({ ...c, count: e.target.value }))} />
        <button className="btn-primary" onClick={onGenerate}>Generate</button>
      </div>
      <div className="mb-3 inline-flex items-center rounded-full border border-border bg-slate-50 px-3 py-1 text-xs">Timer chip: 02:00</div>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <strong>{r.topic}</strong> ({r.difficulty}) - {r.correct}/{r.total}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Chat({ room, setRoom, messages, setMessages }) {
  const [text, setText] = useState('');
  const rooms = ['global', 'private', 'class-group'];
  const roomMessages = messages.filter((m) => m.room === room);
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Class Collaboration Chat</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type message..." />
        <button className="btn-primary" onClick={() => { if (!text.trim()) return; setMessages((p) => [...p, { id: Date.now(), room, text, sender: 'You' }]); setText(''); }}>Send</button>
      </div>
      <ul className="space-y-2">{roomMessages.map((m) => <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><b>{m.sender}:</b> {m.text}</li>)}</ul>
    </section>
  );
}

function Presentations({ presentations, setPresentations, onGenerate, isGenerating, chunks }) {
  const [topic, setTopic] = useState('My Project');
  const [promptText, setPromptText] = useState('Create a classroom-ready deck with examples and references.');
  const [selectedChunkIds, setSelectedChunkIds] = useState([]);
  const [previewId, setPreviewId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const hasChunks = chunks.length > 0;
  const selectedChunks = selectedChunkIds.length
    ? chunks.filter((c) => selectedChunkIds.includes(c.id))
    : (chunks[0] ? [chunks[0]] : []);
  const previewPresentation = presentations.find((p) => p.id === previewId) || null;

  const beginEdit = (p) => {
    setEditingId(p.id);
    setDraft({
      title: p.title || '',
      referencesText: (p.references || [])
        .map((r) => (r.url ? `${r.text} | ${r.url}` : r.text))
        .join('\n'),
      slides: (p.slides || []).map((s) => ({
        title: s.title || '',
        bulletsText: Array.isArray(s.bullets) ? s.bullets.join('\n') : '',
        notes: s.notes || '',
        imageSuggestion: s.imageSuggestion || '',
        graphSuggestion: s.graphSuggestion || '',
      })),
    });
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    setPresentations((prev) =>
      prev.map((p) => {
        if (p.id !== editingId) return p;
        return {
          ...p,
          title: draft.title.trim() || p.title,
          references: draft.referencesText
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [text, url] = line.split('|').map((x) => x?.trim() || '');
              return { text, url };
            }),
          slides: draft.slides.map((s, idx) => ({
            title: s.title.trim() || `Slide ${idx + 1}`,
            bullets: s.bulletsText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 6),
            notes: s.notes.trim(),
            imageSuggestion: s.imageSuggestion.trim(),
            graphSuggestion: s.graphSuggestion.trim(),
          })),
        };
      }),
    );
    setEditingId(null);
    setDraft(null);
  };

  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Presentation Builder</h3>
      <div className="mb-3 flex flex-col gap-2">
        <select
          className="input"
          multiple
          value={selectedChunkIds}
          onChange={(e) => setSelectedChunkIds(Array.from(e.target.selectedOptions).map((o) => o.value))}
          disabled={!hasChunks}
          size={Math.min(6, Math.max(3, chunks.length))}
        >
          {!hasChunks ? <option value="">Upload a PDF in Ingest first</option> : null}
          {chunks.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {hasChunks ? <p className="text-xs text-muted">Select one or more uploaded PDFs as references.</p> : null}
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <textarea
          className="input min-h-24"
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Prompt example: Build 8 slides for second-year students, include a comparison graph and practical examples."
        />
        <button
          className="btn-primary w-fit"
          disabled={isGenerating || !hasChunks}
          onClick={() => onGenerate({
            topic: topic.trim() || (selectedChunks[0] ? selectedChunks[0].name.replace(/\.[^.]+$/, '') : ''),
            promptText,
            chunkIds: selectedChunkIds.length ? selectedChunkIds : [chunks[0].id],
          })}
        >
          {isGenerating ? 'Generating presentation...' : 'Generate outline'}
        </button>
      </div>
      <ul className="space-y-2">
        {presentations.map((p) => (
          <li key={p.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <p className="font-medium">{p.title} ({slideCountLabel(p.slides.length)})</p>
            {p.slides[0] ? (
              <p className="mt-1 text-xs text-muted">
                First slide: {p.slides[0].title}
              </p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <button className="btn-ghost" onClick={() => setPreviewId((id) => (id === p.id ? null : p.id))}>
                {previewId === p.id ? 'Hide preview' : 'Preview'}
              </button>
              <button className="btn-ghost" onClick={() => beginEdit(p)}>
                Edit
              </button>
            </div>
          </li>
        ))}
      </ul>

      {previewPresentation ? (
        <div className="mt-4 rounded-2xl border border-border bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold">Preview: {previewPresentation.title}</p>
            <button
              className="btn-ghost"
              onClick={() => {
                const p = presentations.find((x) => x.id === previewPresentation.id);
                if (p) beginEdit(p);
              }}
            >
              Edit this presentation
            </button>
          </div>
          <div className="max-h-[76vh] space-y-3 overflow-y-auto pr-1">
            {previewPresentation.slides.map((s, idx) => (
              <div key={`${previewPresentation.id}-preview-${idx}`} className="rounded-xl border border-border bg-white p-3 shadow-sm">
                <p className="text-base font-semibold">{idx + 1}. {s.title}</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                  {(s.bullets || []).map((b, i) => <li key={`${previewPresentation.id}-${idx}-b-${i}`}>{b}</li>)}
                </ul>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium text-muted">Visual</p>
                    <img
                      src={imagePlaceholderFromSuggestion(s.imageSuggestion || s.title)}
                      alt={s.imageSuggestion || s.title}
                      className="h-40 w-full rounded-md border border-border object-cover"
                    />
                    {s.imageSuggestion ? <p className="mt-1 text-xs text-muted">{s.imageSuggestion}</p> : null}
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium text-muted">Graph</p>
                    <div className="h-44">
                      <Bar
                        data={buildSlideGraphData(s)}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: { y: { beginAtZero: true, ticks: { stepSize: 2 } } },
                        }}
                      />
                    </div>
                    {s.graphSuggestion ? <p className="mt-1 text-xs text-muted">{s.graphSuggestion}</p> : null}
                  </div>
                </div>
                {s.notes ? <p className="mt-2 text-xs text-muted">Notes: {s.notes}</p> : null}
              </div>
            ))}
          </div>
          {(previewPresentation.references || []).length ? (
            <div className="mt-3 rounded-lg border border-border bg-white p-2">
              <p className="text-xs font-semibold">References</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted">
                {previewPresentation.references.map((r, i) => (
                  <li key={`${previewPresentation.id}-ref-${i}`}>
                    {r.url ? <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.text}</a> : r.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {editingId && draft ? (
        <div className="mt-4 rounded-xl border border-border bg-slate-50 p-3">
          <p className="text-sm font-semibold">Edit presentation</p>
          <input
            className="input mt-2"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Presentation title"
          />
          <textarea
            className="input mt-2 min-h-16"
            value={draft.referencesText}
            onChange={(e) => setDraft((d) => ({ ...d, referencesText: e.target.value }))}
            placeholder="References (one per line). Optional format: Title | URL"
          />
          <div className="mt-2 space-y-3">
            {draft.slides.map((s, idx) => (
              <div key={`edit-slide-${idx}`} className="rounded-lg border border-border bg-white p-2">
                <input
                  className="input mb-2"
                  value={s.title}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slides: d.slides.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                    }))
                  }
                  placeholder={`Slide ${idx + 1} title`}
                />
                <textarea
                  className="input mb-2 min-h-20"
                  value={s.bulletsText}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slides: d.slides.map((x, i) => (i === idx ? { ...x, bulletsText: e.target.value } : x)),
                    }))
                  }
                  placeholder="One bullet per line"
                />
                <textarea
                  className="input min-h-16"
                  value={s.notes}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slides: d.slides.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)),
                    }))
                  }
                  placeholder="Speaker notes"
                />
                <input
                  className="input mt-2"
                  value={s.imageSuggestion}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slides: d.slides.map((x, i) => (i === idx ? { ...x, imageSuggestion: e.target.value } : x)),
                    }))
                  }
                  placeholder="Image suggestion"
                />
                <input
                  className="input mt-2"
                  value={s.graphSuggestion}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      slides: d.slides.map((x, i) => (i === idx ? { ...x, graphSuggestion: e.target.value } : x)),
                    }))
                  }
                  placeholder="Graph suggestion"
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={saveEdit}>Save changes</button>
            <button className="btn-ghost" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}



function Academics({ grades, setGrades, simulations, setSimulations, avg, gradesChartData, kpiData }) {
  const [subject, setSubject] = useState('Math');
  const [score, setScore] = useState(85);
  const [weight, setWeight] = useState(0.4);
  const [target, setTarget] = useState(90);
  const [finalWeight, setFinalWeight] = useState(0.5);
  const add = () => setGrades([{ id: Date.now(), subject, score: Number(score), weight: Number(weight) }, ...grades]);
  const simulate = () => {
    const req = finalWeight <= 0 ? 0 : Math.max(0, Math.min(100, (target - avg * (1 - finalWeight)) / finalWeight));
    setSimulations([{ id: Date.now(), req, target }, ...simulations]);
  };
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Academic Progress</h3>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Average</p><p className="text-xl font-semibold">{avg.toFixed(1)}</p></div>
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Target</p><p className="text-xl font-semibold">{target}</p></div>
        <div className="rounded-xl border border-border bg-slate-50 p-3"><p className="text-xs text-muted">Required Final</p><p className="text-xl font-semibold">{simulations[0]?.req?.toFixed(1) || '0.0'}</p></div>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-3"><Line data={gradesChartData} /></div>
        <div className="rounded-xl border border-border bg-white p-3"><Doughnut data={kpiData} /></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <input className="input" type="number" value={score} onChange={(e) => setScore(e.target.value)} />
        <input className="input" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        <button className="btn-primary" onClick={add}>Add grade</button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input" type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        <input className="input" type="number" step="0.1" value={finalWeight} onChange={(e) => setFinalWeight(Number(e.target.value))} />
        <button className="btn-ghost" onClick={simulate}>Simulate final</button>
      </div>
      <ul className="space-y-2">{simulations.map((s) => <li key={s.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">Need {s.req.toFixed(1)} to reach {s.target}</li>)}</ul>
    </section>
  );
}

function AiTutor({ tutorMessages, setTutorMessages }) {
  const [prompt, setPrompt] = useState('');
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">AI Tutor</h3>
      <textarea className="input min-h-24" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask study guidance..." />
      <button className="btn-primary mt-2" onClick={() => { if (!prompt.trim()) return; setTutorMessages((prev) => [...prev, { id: Date.now(), you: prompt, tutor: 'Break work into 25-minute focused blocks and review weak topics first.' }]); setPrompt(''); }}>Ask Tutor</button>
      <ul className="mt-3 space-y-2">{tutorMessages.map((m) => <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><b>You:</b> {m.you}<br /><b>Tutor:</b> {m.tutor}</li>)}</ul>
    </section>
  );
}
