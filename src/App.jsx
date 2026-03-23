import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import AuthPanel from './components/AuthPanel';
import UploadCard from './components/UploadCard';
import FlashcardDeck from './components/FlashcardDeck';
import SubirArchivoPanel from './components/SubirArchivoPanel';
import TablaApartados from './components/TablaApartados';
import NotebookWorkspace from './components/NotebookWorkspace';
import { supabase as supabaseBrowser } from './lib/supabaseClient';
import TeacherWindow from './components/teacher/TeacherWindow';
import CommandPalette from './components/CommandPalette';
import TasksCalendar from './components/TasksCalendar';
const GraficasProgreso = lazy(() => import('./components/GraficasProgreso'));
const SesionEstudio = lazy(() => import('./components/SesionEstudio'));
const ConceptMap = lazy(() => import('./components/ConceptMap'));

ChartJS.register(ArcElement, BarElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);
try {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
} catch (e) {
  console.warn('[Student Assistant] PDF.js worker URL could not be set:', e);
}

const tabs = ['Ingest', 'Flashcards', 'Notebook', 'Concept Map', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor', 'Teacher Window'];

/** Local-only PDF backup (before sign-in). Cleared after successful sync to Supabase. */
const LOCAL_PDFS_KEY = 'sa_account_pdfs_v1';
const LOCAL_PDFS_MAX_BYTES = 4_500_000;

function mapLibraryPdfToChunk(p) {
  return {
    id: `db-pdf-${p.id}`,
    name: p.name,
    content: p.content || '',
    createdAt: p.createdAt || null,
  };
}
function cleanAcademicText(raw) {
  let text = (raw || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');

  // Remove legal/footer tails that often pollute study extraction.
  const cutoffPatterns = [
    /\ball rights reserved\b/i,
    /\bcopyright\b/i,
    /\bterms of use\b/i,
    /\bterms & conditions\b/i,
    /\bterms and conditions\b/i,
    /\bprinted in\b/i,
    /\bunauthorized reproduction\b/i,
    /\blicensed to\b/i,
  ];
  let firstCutoff = -1;
  for (const pattern of cutoffPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      if (firstCutoff === -1 || match.index < firstCutoff) firstCutoff = match.index;
    }
  }
  if (firstCutoff >= 0) text = text.slice(0, firstCutoff);

  return text.trim();
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

async function generateConceptMapWithOllama({ text, title }) {
  const resp = await fetchWithTimeout('/api/concept-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title }),
  }, 45000);
  if (!resp.ok) throw new Error('Concept map API error');
  const data = await resp.json();
  return {
    title: String(data.title || title || 'Concept Map').trim(),
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : [],
  };
}

async function sourceChatWithOllama({ question, sources }) {
  const resp = await fetchWithTimeout('/api/source-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Source chat API error');
  return await resp.json();
}

async function generateSummaryWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Summary API error');
  return await resp.json();
}

async function generateStudyGuideWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/study-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Study guide API error');
  return await resp.json();
}

async function compareSourcesWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/source-compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Source compare API error');
  return await resp.json();
}

async function generateAudioOverviewWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/audio-overview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Audio overview API error');
  return await resp.json();
}

async function generateQuizWithOllama({ mode, difficulty, count, sources }) {
  const resp = await fetchWithTimeout('/api/quiz-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, difficulty, count, sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Quiz API error');
  return await resp.json();
}

async function tutorChatWithOllama({ prompt, sources }) {
  const resp = await fetchWithTimeout('/api/tutor-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sources }),
  }, 45000);
  if (!resp.ok) throw new Error('Tutor API error');
  return await resp.json();
}

async function academicsAdviceWithOllama({ grades, target, finalWeight, avg }) {
  const resp = await fetchWithTimeout('/api/academics-advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grades, target, finalWeight, avg }),
  }, 45000);
  if (!resp.ok) throw new Error('Academics advice API error');
  return await resp.json();
}

async function academicsEstimateWithOllama({ target, finalWeight, avg }) {
  const resp = await fetchWithTimeout('/api/academics-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, finalWeight, avg }),
  }, 45000);
  if (!resp.ok) throw new Error('Academics estimate API error');
  return await resp.json();
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

async function upsertStudent(studentId, name = 'Student') {
  if (!studentId) return;
  await fetchWithTimeout('/api/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, name }),
  }, 12000);
}

async function savePdfToLibrary({ studentId, name, content }) {
  if (!studentId) return null;
  const resp = await fetchWithTimeout(
    '/api/library/pdf',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, name, content }),
    },
    120_000,
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(t || 'Could not save PDF to your account.');
  }
  return await resp.json();
}

async function saveConceptMapToLibrary({ studentId, sourceName, title, map }) {
  if (!studentId) return;
  await fetchWithTimeout('/api/library/concept-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, sourceName, title, map }),
  }, 20000);
}

async function saveNotebookOutputToLibrary({ studentId, sourceNames, outputType, output }) {
  if (!studentId) return;
  await fetchWithTimeout('/api/library/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, sourceNames, outputType, output }),
  }, 20000);
}

async function loadLibrary(studentId) {
  if (!studentId) return { pdfs: [], maps: [], notebook: [] };
  const resp = await fetchWithTimeout(`/api/library?studentId=${encodeURIComponent(studentId)}`, {}, 20000);
  if (!resp.ok) throw new Error('Could not load library');
  return await resp.json();
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

/** Deterministic stock-style placeholder (same deck + slide = same image). Not topic-specific without a paid API. */
function slideHeroImageUrl(deckTitle, slideIndex, slideTitle) {
  const raw = `${deckTitle || 'deck'}|${slideIndex}|${slideTitle || ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  const seed = `sa${Math.abs(h).toString(36)}`;
  return `https://picsum.photos/seed/${seed}/960/540`;
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
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return (cardsInput || []).map((c, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return {
      ...c,
      id: c.id || `${Date.now()}-${i}`,
      question: c.question || c.frente || 'Question',
      answer: c.answer || c.atras || '',
      tema: c.tema || 'General',
      dificultad: c.dificultad || 'media',
      proxima_revision: c.proxima_revision || d.toISOString().split('T')[0],
      intervalo_dias: Number(c.intervalo_dias || 1),
      veces_bien: Number(c.veces_bien || 0),
      veces_mal: Number(c.veces_mal || 0),
    };
  });
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

function displayNameFromUser(user) {
  if (!user) return 'Student';
  const meta = user.user_metadata || {};
  return meta.full_name || meta.name || user.email?.split('@')[0] || 'Student';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabaseBrowser);
  const studentId = session?.user?.id ?? null;
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
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
  const [conceptMapData, setConceptMapData] = useState(null);
  const [isGeneratingConceptMap, setIsGeneratingConceptMap] = useState(false);
  const [isNotebookBusy, setIsNotebookBusy] = useState(false);
  const [modelStatus, setModelStatus] = useState({ ok: false, model: 'qwen2.5:7b' });
  const [quizConfig, setQuizConfig] = useState({ mode: 'quiz', difficulty: 'medium', count: 10 });
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isTutorBusy, setIsTutorBusy] = useState(false);
  const [isAcademicsAiBusy, setIsAcademicsAiBusy] = useState(false);

  useEffect(() => {
    if (!supabaseBrowser) {
      setAuthLoading(false);
      return undefined;
    }
    let mounted = true;
    supabaseBrowser.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) {
        setSession(s);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((v) => !v);
      }
      if (e.key === 'Escape') setIsCommandOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  useEffect(() => {
    if (!studentId) return undefined;
    let mounted = true;
    const bootstrapDb = async () => {
      try {
        await upsertStudent(studentId, displayNameFromUser(session?.user));
        // Push any PDFs that were uploaded while signed out into this account.
        try {
          const raw = localStorage.getItem(LOCAL_PDFS_KEY);
          if (raw) {
            const local = JSON.parse(raw);
            if (Array.isArray(local) && local.length) {
              let anyFailed = false;
              for (const p of local) {
                if (!p?.name || !p?.content) continue;
                try {
                  await savePdfToLibrary({ studentId, name: p.name, content: p.content });
                } catch {
                  anyFailed = true;
                }
              }
              if (!anyFailed) localStorage.removeItem(LOCAL_PDFS_KEY);
            }
          }
        } catch {
          /* ignore migration */
        }
        const data = await loadLibrary(studentId);
        if (!mounted) return;
        const dbChunks = Array.isArray(data?.pdfs) ? data.pdfs.map(mapLibraryPdfToChunk) : [];
        setChunks(dbChunks);
      } catch {
        // Keep app usable even if DB bootstrap fails.
      }
    };
    bootstrapDb();
    return () => {
      mounted = false;
    };
  }, [studentId, session?.user]);

  const offlinePdfHydratedRef = useRef(false);
  const offlinePdfSizeWarnedRef = useRef(false);

  /** Signed-out: hydrate from localStorage (or clear cloud state on logout), then persist edits */
  useEffect(() => {
    if (studentId) {
      offlinePdfHydratedRef.current = false;
      offlinePdfSizeWarnedRef.current = false;
      return;
    }
    if (!offlinePdfHydratedRef.current) {
      offlinePdfHydratedRef.current = true;
      try {
        const raw = localStorage.getItem(LOCAL_PDFS_KEY);
        if (raw) {
          const local = JSON.parse(raw);
          if (Array.isArray(local) && local.length) {
            setChunks(local);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      setChunks([]);
      return;
    }
    try {
      if (!chunks.length) {
        localStorage.removeItem(LOCAL_PDFS_KEY);
        return;
      }
      const payload = JSON.stringify(
        chunks.map((c) => ({ id: c.id, name: c.name, content: c.content, createdAt: c.createdAt })),
      );
      if (payload.length > LOCAL_PDFS_MAX_BYTES) {
        if (!offlinePdfSizeWarnedRef.current) {
          offlinePdfSizeWarnedRef.current = true;
          setNotice('Library is too large for offline storage in this browser — sign in to keep everything in your account.');
        }
        return;
      }
      localStorage.setItem(LOCAL_PDFS_KEY, payload);
    } catch {
      if (!offlinePdfSizeWarnedRef.current) {
        offlinePdfSizeWarnedRef.current = true;
        setNotice('Could not save PDFs offline — sign in to store them in your account.');
      }
    }
  }, [chunks, studentId, setNotice]);

  const avg = useMemo(() => {
    const w = grades.reduce((s, g) => s + g.weight, 0);
    if (!w) return 0;
    return grades.reduce((s, g) => s + g.score * g.weight, 0) / w;
  }, [grades]);

  const commandItems = useMemo(() => {
    const items = [];
    chunks.forEach((c) => items.push({ id: `pdf-${c.id}`, label: c.name, category: 'PDF', action: () => setTab('Ingest') }));
    cards.slice(0, 20).forEach((c) => items.push({ id: `card-${c.id}`, label: c.question, category: 'Flashcard', action: () => setTab('Flashcards') }));
    messages.slice(-20).forEach((m) => items.push({ id: `chat-${m.id}`, label: m.text, category: 'Chat', action: () => setTab('Chat') }));
    tutorMessages.slice(-20).forEach((m) => items.push({ id: `tutor-${m.id}`, label: m.you, category: 'AI Tutor', action: () => setTab('AI Tutor') }));
    presentations.forEach((p) => items.push({ id: `pres-${p.id}`, label: p.title, category: 'Presentation', action: () => setTab('Presentations') }));
    tasks.slice(0, 40).forEach((t) =>
      items.push({ id: `task-${t.id}`, label: t.title || 'Task', category: 'Task', action: () => setTab('Tasks') }),
    );
    return items;
  }, [chunks, cards, messages, tutorMessages, presentations, tasks]);

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
      if (studentId) {
        try {
          const saved = await savePdfToLibrary({ studentId, name: chunk.name, content: chunk.content });
          if (saved?.id) {
            setChunks((prev) =>
              prev.map((c) => (c.id === chunk.id ? { ...c, id: `db-pdf-${saved.id}`, createdAt: new Date().toISOString() } : c)),
            );
          }
        } catch (e) {
          setNotice(`PDF read OK, but not saved to your account: ${e?.message || 'API error'}`);
        }
      } else {
        setNotice('Saved in this browser only — sign in to keep PDFs in your account across devices.');
      }
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

  const generateConceptMap = async (chunkId) => {
    const chunk = chunkId ? chunks.find((c) => c.id === chunkId) : chunks[0];
    if (!chunk?.content?.trim()) {
      setNotice('Upload a PDF first, then generate a concept map.');
      return;
    }
    setIsGeneratingConceptMap(true);
    setNotice('Generating concept map from document...');
    try {
      const generated = await generateConceptMapWithOllama({
        text: chunk.content,
        title: chunk.name.replace(/\.[^.]+$/, ''),
      });
      if (generated.nodes.length) {
        setConceptMapData(generated);
        try {
          await saveConceptMapToLibrary({
            studentId,
            sourceName: chunk.name,
            title: generated.title || chunk.name.replace(/\.[^.]+$/, ''),
            map: generated,
          });
        } catch {
          // Non-blocking persistence.
        }
        setNotice(
          studentId
            ? `Concept map generated with ${generated.nodes.length} concepts.`
            : `Concept map generated with ${generated.nodes.length} concepts (local only until sign-in).`,
        );
        return;
      }
      setConceptMapData(null);
      setNotice('Concept map generation returned empty output.');
    } catch (error) {
      setConceptMapData(null);
      setNotice(`${error?.message || 'AI unavailable'} while generating concept map.`);
    } finally {
      setIsGeneratingConceptMap(false);
    }
  };

  const runNotebookAction = async (action, label, outputType, sources = []) => {
    setIsNotebookBusy(true);
    setNotice(`${label}...`);
    try {
      const result = await action();
      try {
        await saveNotebookOutputToLibrary({
          studentId,
          sourceNames: sources.map((s) => s.name).filter(Boolean),
          outputType,
          output: result,
        });
      } catch {
        // Non-blocking persistence.
      }
      setNotice(studentId ? `${label} completed.` : `${label} completed (local only until sign-in).`);
      return result;
    } catch (error) {
      setNotice(`${error?.message || `${label} failed`}.`);
      throw error;
    } finally {
      setIsNotebookBusy(false);
    }
  };

  const generateQuiz = async () => {
    const sources = (chunks.length ? [chunks[0]] : []).map((c) => ({ name: c.name, content: c.content }));
    if (!sources.length) {
      setNotice('Upload a PDF first to generate AI quizzes.');
      return;
    }
    setIsGeneratingQuiz(true);
    setNotice('Powered by Ollama: generating quiz...');
    try {
      const result = await generateQuizWithOllama({
        mode: quizConfig.mode,
        difficulty: quizConfig.difficulty,
        count: Number(quizConfig.count),
        sources,
      });
      setQuizResults((prev) => [result, ...prev]);
      setNotice('Powered by Ollama: quiz generated.');
    } catch (error) {
      setNotice(`${error?.message || 'Quiz generation failed'}.`);
    } finally {
      setIsGeneratingQuiz(false);
    }
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
    <>
    <AppShell
      tabs={tabs}
      tab={tab}
      setTab={setTab}
      modelStatus={modelStatus}
      latestBatchAt={latestBatchAt}
      notice={notice}
      authPanel={<AuthPanel supabase={supabaseBrowser} session={session} loading={authLoading} onAuthChange={(nextSession) => setSession(nextSession)} />}
      isFocusMode={isFocusMode}
      setIsFocusMode={setIsFocusMode}
      onOpenSearch={() => setIsCommandOpen(true)}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
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
      {tab === 'Notebook' ? (
        <NotebookWorkspace
          chunks={chunks}
          isBusy={isNotebookBusy}
          onError={(msg) => setNotice(msg)}
          conceptMapData={conceptMapData}
          onCitationSelect={(citation) => {
            if (citation?.source) setNotice(`Citation selected: ${citation.source}`);
          }}
          onCreateFlashcardFromSelection={(text) => {
            if (!text?.trim()) return;
            const generated = normalizeStudyCards([{ question: `Explain this highlighted idea`, answer: text.trim() }]);
            setCards((prev) => [...generated, ...prev]);
            setTab('Flashcards');
            setNotice('Flashcard created from selected text.');
          }}
          onSummarizeSelection={async (text) => {
            const result = await runNotebookAction(
              () => generateSummaryWithOllama({ sources: [{ name: 'Selection', content: text }] }),
              'Selection summary',
              'summary',
              [{ name: 'Selection' }],
            );
            if (result?.keyPoints?.length) setNotice(`Summary: ${result.keyPoints[0]}`);
          }}
          onExplainSelection={async (text) => {
            const data = await tutorChatWithOllama({ prompt: `Explain this like I am 5: ${text}`, sources: [] });
            setNotice(String(data?.reply || 'Explanation generated.'));
          }}
          onSourceChat={({ question, sources }) =>
            runNotebookAction(
              () => sourceChatWithOllama({ question, sources }),
              'Source-grounded chat',
              'source-chat',
              sources,
            )
          }
          onSummary={({ sources }) =>
            runNotebookAction(
              () => generateSummaryWithOllama({ sources }),
              'Summary generation',
              'summary',
              sources,
            )
          }
          onStudyGuide={({ sources }) =>
            runNotebookAction(
              () => generateStudyGuideWithOllama({ sources }),
              'Study guide generation',
              'study-guide',
              sources,
            )
          }
          onCompare={({ sources }) =>
            runNotebookAction(
              () => compareSourcesWithOllama({ sources }),
              'Source comparison',
              'source-compare',
              sources,
            )
          }
          onAudioOverview={({ sources }) =>
            runNotebookAction(
              () => generateAudioOverviewWithOllama({ sources }),
              'Audio overview generation',
              'audio-overview',
              sources,
            )
          }
        />
      ) : null}

      {tab === 'Tasks' ? (
        <TasksCalendar tasks={tasks} setTasks={setTasks} studentId={studentId} session={session} setNotice={setNotice} />
      ) : null}
      {tab === 'Quizzes' ? (
        <Quizzes
          config={quizConfig}
          setConfig={setQuizConfig}
          onGenerate={generateQuiz}
          results={quizResults}
          isGenerating={isGeneratingQuiz}
        />
      ) : null}
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
          <ConceptMap
            apartados={apartados}
            chunks={chunks}
            conceptMapData={conceptMapData}
            isGenerating={isGeneratingConceptMap}
            onGenerate={generateConceptMap}
          />
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
            isBusy={isAcademicsAiBusy}
            onAiAdvice={async ({ target, finalWeight }) => {
              setIsAcademicsAiBusy(true);
              setNotice('Powered by Ollama: generating academic recommendations...');
              try {
                const data = await academicsAdviceWithOllama({ grades, target, finalWeight, avg });
                setNotice('Powered by Ollama: recommendations ready.');
                return data;
              } catch (error) {
                setNotice(`${error?.message || 'Advice generation failed'}.`);
                return null;
              } finally {
                setIsAcademicsAiBusy(false);
              }
            }}
            onAiEstimate={async ({ target, finalWeight }) => {
              setIsAcademicsAiBusy(true);
              setNotice('Powered by Ollama: estimating required final...');
              try {
                const data = await academicsEstimateWithOllama({ target, finalWeight, avg });
                setNotice('Powered by Ollama: estimate ready.');
                return data;
              } catch (error) {
                setNotice(`${error?.message || 'Estimate failed'}.`);
                return null;
              } finally {
                setIsAcademicsAiBusy(false);
              }
            }}
          />
          <Suspense fallback={<section className="panel mt-4 text-sm text-muted">Loading charts...</section>}>
            <GraficasProgreso apartados={apartados} />
          </Suspense>
        </>
      ) : null}
      {tab === 'AI Tutor' ? (
        <AiTutor
          tutorMessages={tutorMessages}
          setTutorMessages={setTutorMessages}
          chunks={chunks}
          isBusy={isTutorBusy}
          onNotify={setNotice}
          onAsk={async (prompt) => {
            setIsTutorBusy(true);
            setNotice('Powered by Ollama: AI Tutor is thinking...');
            try {
              const sources = chunks.slice(0, 5).map((c) => ({ name: c.name, content: c.content }));
              const data = await tutorChatWithOllama({ prompt, sources });
              setNotice('Powered by Ollama: tutor response ready.');
              return String(data?.reply || '').trim();
            } catch (error) {
              setNotice(`${error?.message || 'Tutor request failed'}.`);
              return 'I could not respond right now. Please try again.';
            } finally {
              setIsTutorBusy(false);
            }
          }}
        />
      ) : null}
      {tab === 'Teacher Window' ? (
        <TeacherWindow teacherId={studentId} setNotice={setNotice} />
      ) : null}
    </AppShell>
    <CommandPalette
      open={isCommandOpen}
      onClose={() => setIsCommandOpen(false)}
      items={commandItems}
      onSelect={(item) => item.action?.()}
    />
    </>
  );
}

function Quizzes({ config, setConfig, onGenerate, results, isGenerating }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});

  const answerKey = (quizId, qi) => `${quizId}-${qi}`;
  const setAnswer = (quizId, qi, choiceIdx) => {
    setAnswers((a) => ({ ...a, [answerKey(quizId, qi)]: choiceIdx }));
  };

  const submitQuiz = (quiz) => {
    const qs = quiz.questions || [];
    let correct = 0;
    qs.forEach((q, i) => {
      const pick = answers[answerKey(quiz.id, i)];
      if (pick === q.correctIndex) correct += 1;
    });
    setSubmitted((s) => ({ ...s, [quiz.id]: { correct, total: qs.length } }));
  };

  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Quiz / Exam Generator</h3>
      <p className="mb-2 text-xs text-muted">Powered by Ollama — multiple-choice questions from your PDF text.</p>
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <select className="input" value={config.mode} onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value }))}>
          <option value="quiz">Quiz</option>
          <option value="exam">Exam</option>
          <option value="test">Test</option>
        </select>
        <select className="input" value={config.difficulty} onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value }))}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <input className="input" type="number" min={3} max={30} value={config.count} onChange={(e) => setConfig((c) => ({ ...c, count: e.target.value }))} />
        <button type="button" className="btn-primary" disabled={isGenerating} onClick={onGenerate}>
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      <ul className="space-y-4">
        {results.map((r) => {
          const qs = Array.isArray(r.questions) ? r.questions : [];
          const done = submitted[r.id];
          return (
            <li key={r.id} className="rounded-xl border border-border bg-white p-4 text-sm shadow-sm">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-base text-slate-900">{r.topic}</strong>
                <span className="text-xs text-muted">
                  {r.difficulty} · suggested time ~{Math.ceil((r.sec || 120) / 60)} min
                  {done ? (
                    <span className="ml-2 font-semibold text-indigo-700">
                      Your score: {done.correct}/{done.total}
                    </span>
                  ) : (
                    <span className="ml-2">AI estimate: {r.correct}/{r.total}</span>
                  )}
                </span>
              </div>
              {qs.length ? (
                <div className="space-y-4">
                  {qs.map((q, qi) => (
                    <div key={q.id || qi} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                      <p className="mb-2 font-medium text-slate-800">
                        {qi + 1}. {q.prompt}
                      </p>
                      <ul className="space-y-1.5">
                        {(q.choices || []).map((c, ci) => {
                          const picked = answers[answerKey(r.id, qi)];
                          const show = done;
                          const isCorrect = ci === q.correctIndex;
                          const isPicked = picked === ci;
                          let rowClass = 'rounded-lg border px-2 py-1.5 text-xs ';
                          if (show) {
                            rowClass += isCorrect ? 'border-emerald-300 bg-emerald-50' : isPicked ? 'border-rose-200 bg-rose-50' : 'border-border bg-white';
                          } else {
                            rowClass += isPicked ? 'border-indigo-300 bg-indigo-50' : 'border-border bg-white';
                          }
                          return (
                            <li key={ci} className={rowClass}>
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="radio"
                                  className="mt-0.5"
                                  name={`quiz-${r.id}-q-${qi}`}
                                  checked={picked === ci}
                                  disabled={!!done}
                                  onChange={() => setAnswer(r.id, qi, ci)}
                                />
                                <span>{c}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {!done ? (
                    <button type="button" className="btn-primary" onClick={() => submitQuiz(r)}>
                      Submit answers
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted">No questions in this result (regenerate).</p>
              )}
            </li>
          );
        })}
      </ul>
      {!results.length ? <p className="text-sm text-muted">Generate a quiz from your latest uploaded PDF content.</p> : null}
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

  const downloadTextFile = (filename, content, type = 'text/plain') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMarp = (presentation) => {
    const markdown = [
      '---',
      'marp: true',
      'theme: default',
      `title: ${presentation.title}`,
      '---',
      '',
      ...presentation.slides.flatMap((s) => [
        `## ${s.title}`,
        ...(s.bullets || []).map((b) => `- ${b}`),
        '',
        s.notes ? `> ${s.notes}` : '',
        '---',
      ]),
    ].join('\n');
    downloadTextFile(`${presentation.title.replace(/\s+/g, '_') || 'presentation'}.md`, markdown, 'text/markdown');
  };

  const exportPptx = async (presentation) => {
    const mod = await import('pptxgenjs');
    const PptxGenJS = mod.default;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    presentation.slides.forEach((s) => {
      const slide = pptx.addSlide();
      slide.addText(String(s.title || 'Slide'), { x: 0.5, y: 0.4, w: 12, h: 0.6, fontSize: 28, bold: true, color: '1F2937' });
      const bullets = (s.bullets || []).map((b) => ({ text: String(b) }));
      slide.addText(bullets, {
        x: 0.8,
        y: 1.3,
        w: 11.8,
        h: 4.7,
        fontSize: 18,
        color: '111827',
        breakLine: true,
        bullet: { indent: 22 },
      });
      if (s.notes) slide.addNotes(String(s.notes));
    });
    await pptx.writeFile({ fileName: `${presentation.title.replace(/\s+/g, '_') || 'presentation'}.pptx` });
  };

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
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  const p = presentations.find((x) => x.id === previewPresentation.id);
                  if (p) beginEdit(p);
                }}
              >
                Edit this presentation
              </button>
              <button className="btn-ghost" onClick={() => exportMarp(previewPresentation)}>Export Marp (.md)</button>
              <button className="btn-primary" onClick={() => exportPptx(previewPresentation)}>Export .pptx</button>
            </div>
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
                    <p className="mb-1 text-xs font-medium text-muted">Visual (illustrative)</p>
                    <img
                      src={slideHeroImageUrl(previewPresentation.title, idx, s.title)}
                      alt=""
                      loading="lazy"
                      className="h-44 w-full rounded-md border border-border object-cover"
                    />
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Placeholder photo from Picsum (seeded by slide). AI suggestion: {s.imageSuggestion || '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium text-muted">Graph</p>
                    {(s.bullets || []).length >= 2 ? (
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
                    ) : (
                      <p className="py-6 text-center text-xs text-muted">Add at least two bullet points to show a simple emphasis chart.</p>
                    )}
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



function Academics({
  grades,
  setGrades,
  simulations,
  setSimulations,
  avg,
  gradesChartData,
  kpiData,
  onAiAdvice,
  onAiEstimate,
  isBusy,
}) {
  const [subject, setSubject] = useState('Math');
  const [score, setScore] = useState(85);
  const [weight, setWeight] = useState(0.4);
  const [target, setTarget] = useState(90);
  const [finalWeight, setFinalWeight] = useState(0.5);
  const [projectedFinal, setProjectedFinal] = useState(75);
  const [advice, setAdvice] = useState(null);
  const add = () => setGrades([{ id: Date.now(), subject, score: Number(score), weight: Number(weight) }, ...grades]);
  const simulate = () => {
    const req = finalWeight <= 0 ? 0 : Math.max(0, Math.min(100, (target - avg * (1 - finalWeight)) / finalWeight));
    setSimulations([{ id: Date.now(), req, target }, ...simulations]);
  };
  const projectedAverage = avg * (1 - finalWeight) + Number(projectedFinal || 0) * finalWeight;
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Academic Progress</h3>
      <p className="mb-2 text-xs text-muted">Powered by Ollama</p>
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
        <button
          className="btn-primary"
          disabled={isBusy}
          onClick={async () => {
            const data = await onAiEstimate({ target, finalWeight });
            if (data?.requiredFinal !== undefined) {
              setSimulations((prev) => [{ id: Date.now(), req: Number(data.requiredFinal), target }, ...prev]);
            }
          }}
        >
          {isBusy ? 'Estimating...' : 'AI Estimate'}
        </button>
        <button
          className="btn-ghost"
          disabled={isBusy}
          onClick={async () => setAdvice(await onAiAdvice({ target, finalWeight }))}
        >
          {isBusy ? 'Thinking...' : 'AI Advice'}
        </button>
      </div>
      <div className="mb-3 rounded-lg border border-border bg-slate-50 p-3 text-sm">
        <p className="font-semibold">What-if Calculator</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">If final exam score is</span>
          <input className="input w-24" type="number" value={projectedFinal} onChange={(e) => setProjectedFinal(Number(e.target.value))} />
          <span className="text-xs text-muted">projected average:</span>
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{projectedAverage.toFixed(1)}</span>
        </div>
      </div>
      {advice ? (
        <div className="mb-3 rounded-lg border border-border bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Recommendations</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {(advice.recommendations || []).map((r, i) => <li key={`ar-${i}`}>{r}</li>)}
          </ul>
        </div>
      ) : null}
      <ul className="space-y-2">{simulations.map((s) => <li key={s.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">Need {s.req.toFixed(1)} to reach {s.target}</li>)}</ul>
    </section>
  );
}

function AiTutor({ tutorMessages, setTutorMessages, onAsk, isBusy, chunks = [], onNotify }) {
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg =
        'Voice input is not available in this browser. Use Chrome or Edge on desktop, or ensure the page is served over HTTPS (localhost is OK).';
      setVoiceHint(msg);
      onNotify?.(msg);
      return;
    }
    setVoiceHint('');
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setIsListening(true);
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setPrompt((prev) => `${prev} ${transcript}`.trim());
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = (event) => {
      setIsListening(false);
      const code = event?.error || 'unknown';
      const msg =
        code === 'not-allowed'
          ? 'Microphone permission denied — allow mic for this site in browser settings.'
          : `Speech recognition error: ${code}`;
      setVoiceHint(msg);
      onNotify?.(msg);
    };
    try {
      rec.start();
    } catch (e) {
      setIsListening(false);
      const msg = e?.message || 'Could not start speech recognition.';
      setVoiceHint(msg);
      onNotify?.(msg);
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text).slice(0, 1200));
    utter.rate = 1;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  };

  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">AI Tutor</h3>
      <p className="mb-2 text-xs text-muted">
        Powered by Ollama. Uses up to {Math.min(5, chunks.length || 0)} uploaded PDF{chunks.length === 1 ? '' : 's'} for context
        {chunks.length ? ` (${chunks.slice(0, 5).map((c) => c.name).join(', ')})` : ' — upload PDFs in Ingest for source-grounded answers.'}.
      </p>
      {voiceHint ? <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{voiceHint}</p> : null}
      <textarea className="input min-h-24" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask study guidance..." />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={isBusy}
          onClick={async () => {
            if (!prompt.trim()) return;
            const you = prompt;
            setPrompt('');
            const tutor = await onAsk(you);
            setTutorMessages((prev) => [...prev, { id: Date.now(), you, tutor }]);
            speakText(tutor);
          }}
        >
          {isBusy ? 'Thinking...' : 'Ask Tutor'}
        </button>
        <button type="button" className="btn-ghost" onClick={startVoiceInput} disabled={isListening || isBusy}>
          {isListening ? 'Listening...' : 'Push-to-talk'}
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {tutorMessages.map((m) => (
          <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <b>You:</b> {m.you}
            <br />
            <b>Tutor:</b> {m.tutor}
          </li>
        ))}
      </ul>
    </section>
  );
}
