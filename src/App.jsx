import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import RoleLanding from './components/RoleLanding';
import UploadCard from './components/UploadCard';
import FlashcardDeck from './components/FlashcardDeck';
import SubirArchivoPanel from './components/SubirArchivoPanel';
import TablaApartados from './components/TablaApartados';
import NotebookWorkspace from './components/NotebookWorkspace';
import { supabase as supabaseBrowser } from './lib/supabaseClient';
import { apiUrl, enhanceFetchError } from './lib/apiBase';
import { streamTutorChat } from './lib/ollamaStream';
import CommandPalette from './components/CommandPalette';
import LocalLogPanel from './components/LocalLogPanel';
import TasksCalendar from './components/TasksCalendar';
const GraficasProgreso = lazy(() => import('./components/GraficasProgreso'));
const ConceptMap = lazy(() => import('./components/ConceptMap'));

ChartJS.register(ArcElement, BarElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);
try {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
} catch (e) {
  console.warn('[Krea] PDF.js worker URL could not be set:', e);
}

const tabs = ['Ingest', 'LMS', 'Flashcards', 'Notebook', 'Concept Map', 'Tasks', 'Quizzes', 'Chat', 'Presentations', 'Academics', 'AI Tutor'];

/** Local-only PDF backup (before sign-in). Cleared after successful sync to Supabase. */
const LOCAL_PDFS_KEY = 'sa_account_pdfs_v1';
const LOCAL_PDFS_MAX_BYTES = 4_500_000;
/** Signed-in: last known workspace PDFs for refresh/offline resilience (per user). */
const WORKSPACE_PDF_CACHE_PREFIX = 'sa_workspace_pdfs_';

function workspacePdfCacheKey(studentId) {
  return `${WORKSPACE_PDF_CACHE_PREFIX}${studentId}`;
}

function readWorkspacePdfCache(studentId) {
  if (!studentId) return null;
  try {
    const raw = localStorage.getItem(workspacePdfCacheKey(studentId));
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.filter((c) => c && c.id && c.name);
  } catch {
    return null;
  }
}

function writeWorkspacePdfCache(studentId, chunks) {
  if (!studentId || !Array.isArray(chunks)) return;
  try {
    const slim = chunks.map((c) => ({
      id: c.id,
      name: c.name,
      content: c.content || '',
      createdAt: c.createdAt ?? null,
      sourceId: c.sourceId ?? null,
      storagePath: c.storagePath ?? null,
      sizeBytes: c.sizeBytes != null ? c.sizeBytes : null,
    }));
    const payload = JSON.stringify(slim);
    if (payload.length > LOCAL_PDFS_MAX_BYTES) return;
    localStorage.setItem(workspacePdfCacheKey(studentId), payload);
  } catch {
    /* quota / private mode */
  }
}

function clearWorkspacePdfCache(studentId) {
  if (!studentId) return;
  try {
    localStorage.removeItem(workspacePdfCacheKey(studentId));
  } catch {
    /* ignore */
  }
}
/** Client fetch budget for /api/* → Ollama. Keep above server OLLAMA_TIMEOUT_MS (flashcards may run two model calls). */
const AI_REQUEST_TIMEOUT_MS = 180000;
const AI_FLASHCARDS_TIMEOUT_MS = 300000;

function mapLibraryPdfToChunk(p) {
  return {
    id: `db-pdf-${p.id}`,
    sourceId: p.id,
    name: p.name,
    content: p.content || '',
    createdAt: p.createdAt || null,
    storagePath: p.storagePath ?? null,
    sizeBytes: p.sizeBytes != null ? Number(p.sizeBytes) : null,
  };
}

function fileToBase64DataOnly(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
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
  }, AI_FLASHCARDS_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Ollama API error');
  const data = await resp.json();
  return Array.isArray(data.cards) ? data.cards : [];
}

async function generateSectionsWithOllama({ text, title }) {
  const resp = await fetchWithTimeout('/api/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Sections API error');
  const data = await resp.json();
  return Array.isArray(data.apartados) ? data.apartados : [];
}

async function generatePresentationWithOllama({ topic, promptText, sources = [], slides = 8 }) {
  const resp = await fetchWithTimeout('/api/presentation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, promptText, sources, slides }),
  }, AI_REQUEST_TIMEOUT_MS);
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
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Concept map API error');
  const data = await resp.json();
  return {
    title: String(data.title || title || 'Concept Map').trim(),
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    links: Array.isArray(data.links) ? data.links : [],
  };
}

async function sourceChatWithOllama({ question, sources, studentId }) {
  const payload = { question, sources };
  if (studentId) {
    payload.studentId = studentId;
    if (sources.some((s) => s.sourceId)) payload.useRag = true;
  }
  const resp = await fetchWithTimeout('/api/source-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Source chat API error');
  return await resp.json();
}

async function generateSummaryWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Summary API error');
  return await resp.json();
}

async function generateStudyGuideWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/study-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Study guide API error');
  return await resp.json();
}

async function compareSourcesWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/source-compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Source compare API error');
  return await resp.json();
}

async function generateAudioOverviewWithOllama({ sources }) {
  const resp = await fetchWithTimeout('/api/audio-overview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Audio overview API error');
  return await resp.json();
}

async function generateQuizWithOllama({ mode, difficulty, count, sources }) {
  const resp = await fetchWithTimeout('/api/quiz-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, difficulty, count, sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) {
    let msg = 'Quiz API error';
    try {
      const err = await resp.json();
      if (err?.error) msg = err.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return await resp.json();
}

async function tutorChatWithOllama({ prompt, sources }) {
  const resp = await fetchWithTimeout('/api/tutor-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sources }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Tutor API error');
  return await resp.json();
}

async function academicsAdviceWithOllama({ grades, target, finalWeight, avg }) {
  const resp = await fetchWithTimeout('/api/academics-advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grades, target, finalWeight, avg }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Academics advice API error');
  return await resp.json();
}

async function academicsEstimateWithOllama({ target, finalWeight, avg }) {
  const resp = await fetchWithTimeout('/api/academics-estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, finalWeight, avg }),
  }, AI_REQUEST_TIMEOUT_MS);
  if (!resp.ok) throw new Error('Academics estimate API error');
  return await resp.json();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const resolved = typeof url === 'string' && url.startsWith('/') ? apiUrl(url) : url;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resolved, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Request timed out.');
    throw enhanceFetchError(error);
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

/** Must exceed worst-case server indexing (embeddings); UI copy allows 1–3+ minutes for large PDFs. */
const LIBRARY_PDF_SAVE_TIMEOUT_MS = 240_000;

async function savePdfToLibrary({ studentId, name, content, pdfBase64 }) {
  if (!studentId) return null;
  const resp = await fetchWithTimeout(
    '/api/library/pdf',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        name,
        content,
        ...(pdfBase64 ? { pdfBase64 } : {}),
      }),
    },
    LIBRARY_PDF_SAVE_TIMEOUT_MS,
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(t || 'Could not save PDF to your account.');
  }
  return await resp.json();
}

async function saveConceptMapToLibrary({ studentId, sourceName, sourceId, title, map }) {
  if (!studentId) return;
  await fetchWithTimeout('/api/library/concept-map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sourceName,
      ...(sourceId ? { sourceId } : {}),
      title,
      map,
    }),
  }, 20000);
}

async function saveNotebookOutputToLibrary({ studentId, sourceNames, sourceIds, outputType, output }) {
  if (!studentId) return;
  await fetchWithTimeout('/api/library/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sourceNames,
      ...(Array.isArray(sourceIds) && sourceIds.length ? { sourceIds } : {}),
      outputType,
      output,
    }),
  }, 20000);
}

async function saveFlashcardsToLibrary({ studentId, sourceName, sourceId, cards }) {
  if (!studentId || !Array.isArray(cards) || !cards.length) return;
  await fetchWithTimeout('/api/library/flashcards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sourceName,
      ...(sourceId ? { sourceId } : {}),
      cards,
    }),
  }, 25000);
}

async function saveSectionsToLibrary({ studentId, sourceName, sourceId, sections }) {
  if (!studentId || !Array.isArray(sections) || !sections.length) return;
  if (!sourceName?.trim() && !sourceId) return;
  await fetchWithTimeout('/api/library/sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sourceName,
      ...(sourceId ? { sourceId } : {}),
      sections,
    }),
  }, 25000);
}

async function saveQuizToLibrary({ studentId, sourceName, sourceId, mode, difficulty, result }) {
  if (!studentId || !result?.questions?.length) return;
  await fetchWithTimeout('/api/library/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      sourceName,
      ...(sourceId ? { sourceId } : {}),
      mode,
      difficulty,
      result,
    }),
  }, 25000);
}

async function savePresentationToLibrary({ studentId, title, slides, references, sourceNames, sourceIds }) {
  if (!studentId || !Array.isArray(slides) || !slides.length) return;
  await fetchWithTimeout('/api/library/presentation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId,
      title,
      slides,
      references,
      sourceNames,
      ...(Array.isArray(sourceIds) && sourceIds.length ? { sourceIds } : {}),
    }),
  }, 25000);
}

async function saveGradeToLibrary({ studentId, subject, score, weight }) {
  if (!studentId) return null;
  const resp = await fetchWithTimeout('/api/library/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, subject, score, weight }),
  }, 15000);
  if (!resp.ok) throw new Error('Could not save grade.');
  return await resp.json();
}

async function saveSimulationToLibrary({ studentId, target, requiredFinal, finalWeight }) {
  if (!studentId) return null;
  const resp = await fetchWithTimeout('/api/library/simulation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, target, requiredFinal, finalWeight }),
  }, 15000);
  if (!resp.ok) throw new Error('Could not save simulation.');
  return await resp.json();
}

async function saveAcademicAiOutputToLibrary({ studentId, outputType, payload }) {
  if (!studentId) return;
  await fetchWithTimeout('/api/library/academic-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, outputType, payload }),
  }, 15000);
}

async function saveChatMessageToLibrary({ studentId, room, content }) {
  if (!studentId || !content?.trim()) return null;
  const resp = await fetchWithTimeout('/api/library/chat-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, room, content }),
  }, 15000);
  if (!resp.ok) throw new Error('Could not save chat message.');
  return await resp.json();
}

async function saveTutorPairToLibrary({ studentId, prompt, reply }) {
  if (!studentId || !prompt?.trim() || !reply?.trim()) return;
  await fetchWithTimeout('/api/library/tutor-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, prompt, reply }),
  }, 15000);
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

/** Max length accepted by /api/slide-image */
const SLIDE_IMAGE_QUERY_MAX = 280;

function buildSlideImageSearchQuery(deckTitle, slide) {
  const iq = String(slide?.imageSearchQuery || '').trim();
  const parts = [
    ...(iq ? [iq] : []),
    String(deckTitle || '').trim(),
    String(slide?.title || '').trim(),
    ...(Array.isArray(slide?.bullets) ? slide.bullets.slice(0, 3).map((b) => String(b || '').trim()) : []),
    String(slide?.imageSuggestion || '').trim(),
  ].filter(Boolean);
  return parts.join(' ').slice(0, SLIDE_IMAGE_QUERY_MAX).trim();
}

/** Must match server slideTextSuggestsNumericData — charts only when bullets/title cite quantities. */
function slideTextSuggestsNumericDataForChart(slide) {
  const t = [slide?.title, ...(slide?.bullets || [])].join(' ');
  return (
    /\d/.test(t) ||
    /%|percent|percentage|ratio|proportion|×|\btimes\b|\bhalf\b|\bdouble\b|\btriple\b|°[cf]\b|\$|€|£/i.test(t)
  );
}

function slideChartBarsAreValid(chartBars, slide) {
  if (!slide || !slideTextSuggestsNumericDataForChart(slide)) return false;
  if (!Array.isArray(chartBars) || chartBars.length < 2) return false;
  const labels = new Set();
  for (const row of chartBars) {
    const label = String(row?.label || '').trim();
    const value = Number(row?.value);
    if (!label || !Number.isFinite(value)) return false;
    const k = label.toLowerCase();
    if (labels.has(k)) return false;
    labels.add(k);
  }
  return true;
}

/** Chart.js bar payload when slide has model-provided chartBars; otherwise null. */
function buildSlideChartJsData(slide) {
  const bars = slide?.chartBars;
  if (!slideChartBarsAreValid(bars, slide)) return null;
  return {
    labels: bars.map((b) => String(b.label).trim().slice(0, 48)),
    datasets: [
      {
        label: 'From slide outline',
        data: bars.map((b) => Number(b.value)),
        backgroundColor: 'rgba(37,99,235,0.45)',
        borderColor: '#2563eb',
        borderWidth: 1,
      },
    ],
  };
}

function slideImageFallbackUrl(deckTitle, slideIndex, slideTitle) {
  return slideHeroImageUrl(deckTitle, slideIndex, slideTitle);
}

async function fetchSlideHeroImageUrl(deckTitle, slideIndex, slide) {
  const slideTitle = typeof slide === 'string' ? slide : String(slide?.title || '');
  const q = buildSlideImageSearchQuery(deckTitle, typeof slide === 'string' ? { title: slide } : slide);
  if (!q) return slideImageFallbackUrl(deckTitle, slideIndex, slideTitle);
  try {
    const resp = await fetch(`${apiUrl('/api/slide-image')}?q=${encodeURIComponent(q)}`);
    if (!resp.ok) throw new Error('bad status');
    const data = await resp.json();
    if (data?.url && typeof data.url === 'string') return data.url;
  } catch {
    /* use fallback */
  }
  return slideImageFallbackUrl(deckTitle, slideIndex, slideTitle);
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

function tagFlashcardsForChunk(chunk, list) {
  if (!chunk) return list;
  return list.map((c) => ({
    ...c,
    sourceId: chunk.sourceId || c.sourceId || null,
    libraryChunkId: chunk.id,
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

function displayNameFromUser(user) {
  if (!user) return 'Student';
  const meta = user.user_metadata || {};
  return meta.full_name || meta.name || user.email?.split('@')[0] || 'Student';
}

export function StudentApp() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabaseBrowser);
  const studentId = session?.user?.id ?? null;
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [tab, setTab] = useState('Ingest');
  const [chunks, setChunks] = useState([]);
  /** Selected library PDF (chunk id) — drives Flashcards, Notebook, Concept Map, etc. */
  const [activePdfId, setActivePdfId] = useState('');
  const [sectionCatalog, setSectionCatalog] = useState([]);
  const [conceptMapLibrary, setConceptMapLibrary] = useState([]);
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
  const [deckSessionGrades, setDeckSessionGrades] = useState({ right: 0, wrong: 0 });
  const [conceptMapData, setConceptMapData] = useState(null);
  const [isGeneratingConceptMap, setIsGeneratingConceptMap] = useState(false);
  const [isNotebookBusy, setIsNotebookBusy] = useState(false);
  const [localLogOpen, setLocalLogOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState({
    ok: false,
    model: 'qwen2.5:7b',
    deployHost: null,
    healthHint: null,
    healthDetail: null,
    ollamaBase: null,
    ollamaNgrokLocalFallback: false,
  });
  const [quizConfig, setQuizConfig] = useState({ mode: 'quiz', difficulty: 'medium', count: 10 });
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [isTutorBusy, setIsTutorBusy] = useState(false);
  const [tutorStreamPreview, setTutorStreamPreview] = useState('');
  const [isAcademicsAiBusy, setIsAcademicsAiBusy] = useState(false);
  const [libraryReloadBusy, setLibraryReloadBusy] = useState(false);

  /** Apply GET /api/library JSON to client state (bootstrap + manual refresh). */
  const applyLibraryData = useCallback((data) => {
    const dbChunks = Array.isArray(data?.pdfs) ? data.pdfs.map(mapLibraryPdfToChunk) : [];
    setChunks(dbChunks);
    const dbSections = Array.isArray(data?.sections)
      ? data.sections.map((s) => ({
          ...s,
          estado: s.estado === 'completed' ? 'completado' : s.estado === 'in_progress' ? 'en_progreso' : s.estado || 'pendiente',
        }))
      : [];
    setSectionCatalog(dbSections);
    const dbMaps = Array.isArray(data?.maps) ? data.maps : [];
    setConceptMapLibrary(
      dbMaps
        .filter((m) => m.sourceId && m.map)
        .map((m) => ({
          sourceId: m.sourceId,
          title: m.title || '',
          map: m.map,
        })),
    );
    const fcSets = Array.isArray(data?.flashcards?.sets) ? data.flashcards.sets : [];
    const setIdToSourceId = new Map(fcSets.map((s) => [s.id, s.sourceId || null]));
    const dbFlashcards = Array.isArray(data?.flashcards?.cards) ? data.flashcards.cards : [];
    if (dbFlashcards.length) {
      setCards(
        normalizeStudyCards(
          dbFlashcards.map((c) => {
            const sid = c.setId ? setIdToSourceId.get(c.setId) || null : null;
            let chunk = sid ? dbChunks.find((ch) => ch.sourceId === sid) : null;
            if (!chunk && dbChunks.length === 1) chunk = dbChunks[0];
            return {
              question: c.question,
              answer: c.answer,
              id: c.id,
              setId: c.setId,
              sourceId: sid,
              libraryChunkId: chunk?.id || null,
            };
          }),
        ),
      );
    }
    if (Array.isArray(data?.quizzes) && data.quizzes.length) setQuizResults(data.quizzes);
    if (Array.isArray(data?.presentations) && data.presentations.length) setPresentations(data.presentations);
    if (Array.isArray(data?.academics?.grades)) setGrades(data.academics.grades);
    if (Array.isArray(data?.academics?.simulations)) setSimulations(data.academics.simulations);
    if (Array.isArray(data?.chat?.messages)) setMessages(data.chat.messages);
    if (Array.isArray(data?.tutor?.messages)) setTutorMessages(data.tutor.messages);
  }, []);

  const reloadLibraryFromAccount = useCallback(async () => {
    if (!studentId) {
      setNotice('Sign in to load PDFs from your account.');
      return;
    }
    setLibraryReloadBusy(true);
    try {
      const data = await loadLibrary(studentId);
      applyLibraryData(data);
      const n = Array.isArray(data?.pdfs) ? data.pdfs.length : 0;
      setNotice(n ? `Loaded ${n} PDF${n === 1 ? '' : 's'} from your account.` : 'Your account has no saved PDFs yet — upload one below.');
    } catch (err) {
      const cached = readWorkspacePdfCache(studentId);
      if (cached?.length) setChunks(cached);
      setNotice(
        `Could not refresh: ${err?.message || 'connection error'}. ${
          cached?.length ? 'Kept PDFs from this browser’s last successful sync.' : 'No local backup found — check the server and Supabase.'
        }`,
      );
    } finally {
      setLibraryReloadBusy(false);
    }
  }, [studentId, applyLibraryData]);

  const activeChunk = useMemo(() => {
    if (!chunks.length) return null;
    const match = chunks.find((c) => c.id === activePdfId);
    return match || chunks[0];
  }, [chunks, activePdfId]);

  useEffect(() => {
    if (!chunks.length) {
      setActivePdfId('');
      return;
    }
    setActivePdfId((prev) => (prev && chunks.some((c) => c.id === prev) ? prev : chunks[0].id));
  }, [chunks]);

  const deckCards = useMemo(() => {
    if (!activeChunk) return [];
    return cards.filter((c) => {
      if (activeChunk.sourceId) {
        if (c.sourceId) return c.sourceId === activeChunk.sourceId;
        if (c.libraryChunkId) return c.libraryChunkId === activeChunk.id;
        return false;
      }
      if (c.libraryChunkId) return c.libraryChunkId === activeChunk.id;
      if (!c.sourceId && !c.libraryChunkId) return chunks.length === 1;
      return false;
    });
  }, [cards, activeChunk, chunks.length]);

  useEffect(() => {
    setDeckSessionGrades({ right: 0, wrong: 0 });
  }, [activeChunk?.id]);

  useEffect(() => {
    if (!activeChunk?.name) {
      setApartados([]);
      return;
    }
    const rows = sectionCatalog.filter((s) => (s.sourceName || '') === activeChunk.name);
    setApartados(rows);
  }, [activeChunk?.id, activeChunk?.name, sectionCatalog]);

  useEffect(() => {
    if (!activeChunk?.sourceId) {
      setConceptMapData(null);
      return;
    }
    const hit = conceptMapLibrary.find((m) => m.sourceId === activeChunk.sourceId);
    if (hit?.map) {
      const m = hit.map;
      setConceptMapData({
        title: m.title || hit.title || 'Concept Map',
        nodes: m.nodes || [],
        links: m.links || [],
      });
    } else {
      setConceptMapData(null);
    }
  }, [activeChunk?.sourceId, conceptMapLibrary]);

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
        const resp = await fetchWithTimeout('/api/health', {}, 60000);
        const data = await resp.json().catch(() => ({}));
        if (mounted) {
          setModelStatus({
            ok: !!data.ok,
            model: data.model || 'qwen2.5:7b',
            deployHost: data.deployHost || null,
            healthHint: data.hint || null,
            healthDetail: data.detail || null,
            ollamaBase: data.ollamaBase || null,
            ollamaNgrokLocalFallback: !!data.ollamaNgrokLocalFallback,
          });
        }
      } catch {
        if (mounted) {
          setModelStatus({
            ok: false,
            model: 'qwen2.5:7b',
            deployHost: null,
            healthHint: null,
            healthDetail: null,
            ollamaBase: null,
            ollamaNgrokLocalFallback: false,
          });
        }
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
        const cached = readWorkspacePdfCache(studentId);
        if (cached?.length) setChunks(cached);
        const data = await loadLibrary(studentId);
        if (!mounted) return;
        applyLibraryData(data);
      } catch (e) {
        if (!mounted) return;
        const cached = readWorkspacePdfCache(studentId);
        if (cached?.length) setChunks(cached);
        setNotice(
          `Could not load your library: ${e?.message || 'network or server error'}. ${
            cached?.length
              ? 'Showing the last copy saved in this browser — tap “Refresh from account” when you are online.'
              : 'Check that the API server is running and Supabase is configured, then tap “Refresh from account”.'
          }`,
        );
      }
    };
    bootstrapDb();
    return () => {
      mounted = false;
    };
  }, [studentId, session?.user, applyLibraryData]);

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

  /** Keep a signed-in browser copy of workspace PDFs so refresh survives brief API/DB failures. */
  useEffect(() => {
    if (!studentId) return undefined;
    const t = setTimeout(() => {
      if (chunks.length) writeWorkspacePdfCache(studentId, chunks);
      else clearWorkspacePdfCache(studentId);
    }, 400);
    return () => clearTimeout(t);
  }, [chunks, studentId]);

  useEffect(() => {
    const head = activeChunk;
    if (!studentId || !apartados.length || (!head?.name && !head?.sourceId)) return undefined;
    const id = setTimeout(() => {
      saveSectionsToLibrary({
        studentId,
        sourceName: head.name,
        sourceId: head.sourceId,
        sections: apartados,
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(id);
  }, [apartados, studentId, activeChunk]);

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
        const normalized = tagFlashcardsForChunk(chunk, normalizeStudyCards(aiCards));
        setCards((prev) => (append ? [...prev, ...normalized] : normalized));
        if (studentId) {
          try {
            await saveFlashcardsToLibrary({
              studentId,
              sourceName: chunk.name,
              sourceId: chunk.sourceId,
              cards: normalized.map((c) => ({ question: c.question, answer: c.answer, evidence: c.evidence || '' })),
            });
          } catch {
            // Non-blocking persistence.
          }
        }
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
      const normalizedFallback = tagFlashcardsForChunk(chunk, normalizeStudyCards(fallback));
      setCards((prev) => (append ? [...prev, ...normalizedFallback] : normalizedFallback));
      if (studentId) {
        try {
          await saveFlashcardsToLibrary({
            studentId,
            sourceName: chunk.name,
            sourceId: chunk.sourceId,
            cards: normalizedFallback.map((c) => ({ question: c.question, answer: c.answer })),
          });
        } catch {
          // Non-blocking persistence.
        }
      }
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
      const normalizedFallback = tagFlashcardsForChunk(chunk, normalizeStudyCards(fallback));
      setCards((prev) => (append ? [...prev, ...normalizedFallback] : normalizedFallback));
      if (studentId) {
        try {
          await saveFlashcardsToLibrary({
            studentId,
            sourceName: chunk.name,
            sourceId: chunk.sourceId,
            cards: normalizedFallback.map((c) => ({ question: c.question, answer: c.answer })),
          });
        } catch {
          // Non-blocking persistence.
        }
      }
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
      let chunkForGen = chunk;
      setChunks((prev) => [chunk, ...prev]);
      if (studentId) {
        try {
          let pdfBase64;
          if (file.name.toLowerCase().endsWith('.pdf') && file.size <= 18_000_000) {
            setGenerationIndeterminate(true);
            setGenerationStage('Encoding PDF for your account…');
            try {
              pdfBase64 = await fileToBase64DataOnly(file);
            } catch {
              pdfBase64 = undefined;
            }
          }
          setGenerationIndeterminate(true);
          setGenerationStage('Saving to your account (indexing can take 1–3 minutes for large PDFs)…');
          const saved = await savePdfToLibrary({
            studentId,
            name: chunk.name,
            content: chunk.content,
            pdfBase64,
          });
          if (saved?.id) {
            chunkForGen = {
              ...chunk,
              id: `db-pdf-${saved.id}`,
              sourceId: saved.id,
              createdAt: new Date().toISOString(),
            };
            setChunks((prev) =>
              prev.map((c) => (c.id === chunk.id ? chunkForGen : c)),
            );
          }
          if (saved?.storageWarning) {
            setNotice(`Library saved. ${saved.storageWarning}`);
          }
        } catch (e) {
          setNotice(`PDF read OK, but not saved to your account: ${e?.message || 'API error'}`);
        }
      } else {
        setNotice('Saved in this browser only — sign in to keep PDFs in your account across devices.');
      }
      // Upload + save are done; flashcards use AI separately — do not block this handler on Ollama (avoids “stuck” UI).
      setGenerationProgress(0);
      setGenerationStage('');
      setGenerationIndeterminate(false);
      queueMicrotask(() => {
        void generateForChunk(chunkForGen).catch((e) => {
          setNotice(`Flashcard generation failed: ${e?.message || e}`);
        });
      });
    } catch (error) {
      setNotice(`Upload failed: ${error?.message || 'Unknown error.'}`);
      setGenerationProgress(0);
      setGenerationStage('');
    }
  };

  const markCard = useCallback((ok) => {
    const top = deckCards[0];
    if (!top) return;
    setDeckSessionGrades((s) => ({
      right: s.right + (ok ? 1 : 0),
      wrong: s.wrong + (ok ? 0 : 1),
    }));
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === top.id);
      if (idx < 0) return prev;
      const head = prev[idx];
      const rest = prev.filter((_, i) => i !== idx);
      const updated = { ...head, right: head.right + (ok ? 1 : 0), wrong: head.wrong + (!ok ? 1 : 0) };
      return ok ? [...rest, updated] : [updated, ...rest];
    });
    setShowAnswer(false);
  }, [deckCards]);

  const analyzeChunkSections = async (chunkId) => {
    const chunk = chunkId ? chunks.find((c) => c.id === chunkId) : activeChunk;
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
        sourceName: chunk.name,
      }));
      setSectionCatalog((prev) => {
        const rest = prev.filter((s) => (s.sourceName || '') !== chunk.name);
        return [...rest, ...normalized];
      });
      setApartados(normalized);
      if (studentId) {
        try {
          await saveSectionsToLibrary({
            studentId,
            sourceName: chunk.name,
            sourceId: chunk.sourceId,
            sections: normalized,
          });
        } catch {
          // Non-blocking persistence.
        }
      }
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
          sourceName: chunk.name,
        }));
      setSectionCatalog((prev) => {
        const rest = prev.filter((s) => (s.sourceName || '') !== chunk.name);
        return [...rest, ...fallback];
      });
      setApartados(fallback);
      if (studentId && fallback.length) {
        try {
          await saveSectionsToLibrary({
            studentId,
            sourceName: chunk.name,
            sourceId: chunk.sourceId,
            sections: fallback,
          });
        } catch {
          // Non-blocking persistence.
        }
      }
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
      : (activeChunk ? [activeChunk] : []);
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
        const presentation = { id: Date.now(), ...generated };
        setPresentations((prev) => [presentation, ...prev]);
        if (studentId) {
          try {
            await savePresentationToLibrary({
              studentId,
              title: presentation.title,
              slides: presentation.slides,
              references: presentation.references || [],
              sourceNames: sourceChunks.map((c) => c.name),
              sourceIds: sourceChunks.map((c) => c.sourceId).filter(Boolean),
            });
          } catch {
            // Non-blocking persistence.
          }
        }
        setNotice(`Presentation generated: ${slideCountLabel(generated.slides.length)}.`);
        return;
      }
      const fallback = buildFallbackPresentation(resolvedTopic, promptText, sourceChunks.map((c) => c.name));
      const fallbackPresentation = { id: Date.now(), ...fallback };
      setPresentations((prev) => [fallbackPresentation, ...prev]);
      if (studentId) {
        try {
          await savePresentationToLibrary({
            studentId,
            title: fallbackPresentation.title,
            slides: fallbackPresentation.slides,
            references: fallbackPresentation.references || [],
            sourceNames: sourceChunks.map((c) => c.name),
            sourceIds: sourceChunks.map((c) => c.sourceId).filter(Boolean),
          });
        } catch {
          // Non-blocking persistence.
        }
      }
      setNotice(`AI returned no slides. Created backup outline (${slideCountLabel(fallback.slides.length)}).`);
    } catch (error) {
      const fallback = buildFallbackPresentation(resolvedTopic, promptText, sourceChunks.map((c) => c.name));
      const fallbackPresentation = { id: Date.now(), ...fallback };
      setPresentations((prev) => [fallbackPresentation, ...prev]);
      if (studentId) {
        try {
          await savePresentationToLibrary({
            studentId,
            title: fallbackPresentation.title,
            slides: fallbackPresentation.slides,
            references: fallbackPresentation.references || [],
            sourceNames: sourceChunks.map((c) => c.name),
            sourceIds: sourceChunks.map((c) => c.sourceId).filter(Boolean),
          });
        } catch {
          // Non-blocking persistence.
        }
      }
      setNotice(`${error?.message || 'AI model offline'} — generated backup outline (${slideCountLabel(fallback.slides.length)}).`);
    } finally {
      setIsGeneratingPresentation(false);
    }
  };

  const generateConceptMap = async (chunkId) => {
    const chunk = chunkId ? chunks.find((c) => c.id === chunkId) : activeChunk;
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
        if (chunk.sourceId) {
          setConceptMapLibrary((prev) => {
            const rest = prev.filter((m) => m.sourceId !== chunk.sourceId);
            return [
              ...rest,
              {
                sourceId: chunk.sourceId,
                title: generated.title || chunk.name.replace(/\.[^.]+$/, ''),
                map: {
                  title: generated.title || chunk.name.replace(/\.[^.]+$/, ''),
                  nodes: generated.nodes,
                  links: generated.links || [],
                },
              },
            ];
          });
        }
        try {
          await saveConceptMapToLibrary({
            studentId,
            sourceName: chunk.name,
            sourceId: chunk.sourceId,
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
      const enriched = sources.map((s) => {
        const ch = chunks.find((c) => c.name === s.name);
        return { ...s, sourceId: s.sourceId || ch?.sourceId };
      });
      try {
        await saveNotebookOutputToLibrary({
          studentId,
          sourceNames: enriched.map((s) => s.name).filter(Boolean),
          sourceIds: enriched.map((s) => s.sourceId).filter(Boolean),
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
    const sources = (activeChunk ? [activeChunk] : []).map((c) => ({ name: c.name, content: c.content }));
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
      setQuizResults((prev) => [
        { ...result, sourceId: activeChunk?.sourceId || null, sourceName: activeChunk?.name || '' },
        ...prev,
      ]);
      if (studentId) {
        try {
          await saveQuizToLibrary({
            studentId,
            sourceName: activeChunk?.name || '',
            sourceId: activeChunk?.sourceId,
            mode: quizConfig.mode,
            difficulty: quizConfig.difficulty,
            result,
          });
        } catch {
          // Non-blocking persistence.
        }
      }
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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Checking session…
      </div>
    );
  }

  if (!session) {
    return <RoleLanding onSignIn={(s) => setSession(s)} />;
  }

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
      onOpenLocalLog={() => setLocalLogOpen(true)}
      sidebarCollapsed={sidebarCollapsed}
      setSidebarCollapsed={setSidebarCollapsed}
    >
      {tab === 'Ingest' ? (
        <>
          <UploadCard
            onFile={onFileUpload}
            onGenerateLatest={() => activeChunk && generateForChunk(activeChunk)}
            chunks={chunks}
            activePdfId={activePdfId}
            onSelectPdf={setActivePdfId}
            isGenerating={isGenerating}
            progress={generationProgress}
            progressLabel={generationStage}
            isIndeterminate={generationIndeterminate}
            isSignedIn={!!studentId}
            onReloadLibrary={reloadLibraryFromAccount}
            libraryReloadBusy={libraryReloadBusy}
          />
          <SubirArchivoPanel
            chunks={chunks}
            activePdfId={activePdfId}
            onSelectActivePdf={setActivePdfId}
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
            cards={deckCards}
            sourceLabel={activeChunk?.name}
            showAnswer={showAnswer}
            setShowAnswer={setShowAnswer}
            onRight={() => markCard(true)}
            onWrong={() => markCard(false)}
            sessionRight={deckSessionGrades.right}
            sessionWrong={deckSessionGrades.wrong}
            latestBatchAt={latestBatchAt}
            onGenerateMore={() => activeChunk && generateForChunk(activeChunk, { append: true })}
            onClear={() => {
              const drop = new Set(deckCards.map((c) => c.id));
              setCards((prev) => prev.filter((c) => !drop.has(c.id)));
              setLatestBatchAt(null);
              setDeckSessionGrades({ right: 0, wrong: 0 });
            }}
          />
        </>
      ) : null}
      <div
        className={tab === 'Notebook' ? 'contents' : 'hidden'}
        inert={tab !== 'Notebook'}
        aria-hidden={tab !== 'Notebook'}
      >
        <NotebookWorkspace
          chunks={chunks}
          activePdfId={activePdfId}
          isBusy={isNotebookBusy}
          onError={(msg) => setNotice(msg)}
          conceptMapData={conceptMapData}
          onCitationSelect={(citation) => {
            if (citation?.source) setNotice(`Citation selected: ${citation.source}`);
          }}
          onCreateFlashcardFromSelection={(text) => {
            if (!text?.trim() || !activeChunk) return;
            const generated = tagFlashcardsForChunk(
              activeChunk,
              normalizeStudyCards([{ question: `Explain this highlighted idea`, answer: text.trim() }]),
            );
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
              () => sourceChatWithOllama({ question, sources, studentId }),
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
      </div>
      {tab === 'LMS' ? (
        <LmsWorkspace studentId={studentId} setNotice={setNotice} />
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
          activeSourceId={activeChunk?.sourceId || null}
          isGenerating={isGeneratingQuiz}
        />
      ) : null}
      {tab === 'Chat' ? (
        <Chat
          room={room}
          setRoom={setRoom}
          messages={messages}
          setMessages={setMessages}
          studentId={studentId}
          setNotice={setNotice}
        />
      ) : null}
      {tab === 'Presentations' ? (
        <Presentations
          presentations={presentations}
          setPresentations={setPresentations}
          onGenerate={generatePresentation}
          isGenerating={isGeneratingPresentation}
          chunks={chunks}
          activeChunkId={activePdfId}
        />
      ) : null}
      {tab === 'Concept Map' ? (
        <Suspense fallback={<section className="panel text-sm text-muted">Loading concept map...</section>}>
          <ConceptMap
            apartados={apartados}
            chunks={chunks}
            activePdfId={activePdfId}
            onSelectPdf={setActivePdfId}
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
                if (studentId && data) {
                  try {
                    await saveAcademicAiOutputToLibrary({ studentId, outputType: 'advice', payload: data });
                  } catch {
                    // Non-blocking persistence.
                  }
                }
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
                if (studentId && data) {
                  try {
                    await saveAcademicAiOutputToLibrary({ studentId, outputType: 'estimate', payload: data });
                  } catch {
                    // Non-blocking persistence.
                  }
                }
                setNotice('Powered by Ollama: estimate ready.');
                return data;
              } catch (error) {
                setNotice(`${error?.message || 'Estimate failed'}.`);
                return null;
              } finally {
                setIsAcademicsAiBusy(false);
              }
            }}
            onPersistGrade={async (grade) => {
              if (!studentId) return null;
              return await saveGradeToLibrary({ studentId, ...grade });
            }}
            onPersistSimulation={async (simulation) => {
              if (!studentId) return null;
              return await saveSimulationToLibrary({ studentId, ...simulation });
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
          chunks={activeChunk ? [activeChunk] : []}
          studentId={studentId}
          isBusy={isTutorBusy}
          streamingPreview={tutorStreamPreview}
          onNotify={setNotice}
          onAsk={async (prompt) => {
            setIsTutorBusy(true);
            setTutorStreamPreview('');
            setNotice('Powered by Ollama: streaming response…');
            const controller = new AbortController();
            const kill = setTimeout(() => controller.abort(), 300000);
            try {
              const sources = activeChunk
                ? [{ name: activeChunk.name, content: activeChunk.content }]
                : [];
              const reply = await streamTutorChat({
                prompt,
                sources,
                onDelta: (full) => setTutorStreamPreview(full),
                signal: controller.signal,
              });
              setNotice('Powered by Ollama: tutor response ready.');
              return reply || 'I could not respond right now. Please try again.';
            } catch (error) {
              if (error?.name === 'AbortError') {
                setNotice('Tutor request timed out.');
                return 'Request timed out. Try a shorter question or check Ollama.';
              }
              setNotice(`${error?.message || 'Tutor request failed'}.`);
              return 'I could not respond right now. Please try again.';
            } finally {
              clearTimeout(kill);
              setTutorStreamPreview('');
              setIsTutorBusy(false);
            }
          }}
        />
      ) : null}
    </AppShell>
    {localLogOpen ? <LocalLogPanel onClose={() => setLocalLogOpen(false)} /> : null}
    <CommandPalette
      open={isCommandOpen}
      onClose={() => setIsCommandOpen(false)}
      items={commandItems}
      onSelect={(item) => item.action?.()}
    />
    </>
  );
}

const LMS_TABS = [
  { id: 'course', label: 'Course' },
  { id: 'work', label: 'Assignments & quizzes' },
  { id: 'discuss', label: 'Discussions & inbox' },
  { id: 'planner', label: 'Calendar & alerts' },
];

function LmsWorkspace({ studentId, setNotice }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [lmsTab, setLmsTab] = useState('course');
  const [modules, setModules] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [courseQuizzes, setCourseQuizzes] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [submissionText, setSubmissionText] = useState('');
  const [messageText, setMessageText] = useState('');
  const [discussionText, setDiscussionText] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [activeQuizId, setActiveQuizId] = useState('');
  const [quizScore, setQuizScore] = useState('');
  const [activeThreadId, setActiveThreadId] = useState('');
  const [gradeRows, setGradeRows] = useState([]);

  useEffect(() => {
    if (!studentId) return;
    const boot = async () => {
      try {
        const [coursesResp, notifResp, calendarResp] = await Promise.all([
          fetchWithTimeout(`/api/courses?userId=${encodeURIComponent(studentId)}`),
          fetchWithTimeout(`/api/notifications?userId=${encodeURIComponent(studentId)}`),
          fetchWithTimeout(`/api/calendar?userId=${encodeURIComponent(studentId)}`),
        ]);
        const coursesData = await coursesResp.json();
        const notifData = await notifResp.json();
        const calendarData = await calendarResp.json();
        setCourses(coursesData.courses || []);
        setNotifications(notifData.notifications || []);
        setEvents(calendarData.events || []);
        if (!selectedCourseId && coursesData?.courses?.[0]?.id) setSelectedCourseId(coursesData.courses[0].id);
      } catch (e) {
        setNotice?.(e?.message || 'Could not load LMS data.');
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !selectedCourseId) return;
    const loadCourseData = async () => {
      try {
        const [modulesResp, assignmentsResp, discussionsResp, quizzesResp, gradesResp] = await Promise.all([
          fetchWithTimeout(`/api/modules?userId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourseId)}`),
          fetchWithTimeout(`/api/assignments?userId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourseId)}`),
          fetchWithTimeout(`/api/discussions?userId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourseId)}`),
          fetchWithTimeout(`/api/quizzes?userId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourseId)}`),
          fetchWithTimeout(`/api/grades?userId=${encodeURIComponent(studentId)}&courseId=${encodeURIComponent(selectedCourseId)}`),
        ]);
        const modulesData = await modulesResp.json();
        const assignmentsData = await assignmentsResp.json();
        const discussionsData = await discussionsResp.json();
        const quizzesData = await quizzesResp.json();
        const gradesData = await gradesResp.json();
        setModules(modulesData.modules || []);
        setAssignments(assignmentsData.assignments || []);
        setDiscussions(discussionsData.discussions || []);
        setCourseQuizzes(quizzesData.quizzes || []);
        setGradeRows(gradesData.submissions || []);
      } catch (e) {
        setNotice?.(e?.message || 'Could not load selected course.');
      }
    };
    loadCourseData();
  }, [studentId, selectedCourseId, setNotice]);

  useEffect(() => {
    if (!studentId) return;
    const loadMessages = async () => {
      try {
        const resp = await fetchWithTimeout(`/api/messages?userId=${encodeURIComponent(studentId)}`);
        const data = await resp.json();
        setThreads(data.threads || []);
        setMessages(data.messages || []);
        if (!activeThreadId && data?.threads?.[0]?.id) setActiveThreadId(data.threads[0].id);
      } catch {
        // Non-blocking for LMS view.
      }
    };
    loadMessages();
  }, [studentId, activeThreadId]);

  if (!studentId) {
    return <section className="panel text-sm text-muted">Sign in to use LMS workflows.</section>;
  }

  const threadMessages = messages.filter((m) => m.thread_id === activeThreadId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const lmsCardClass = 'rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm';
  const lmsCardTitle = 'mb-3 text-sm font-semibold text-slate-900';
  const lmsMutedBox = 'rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-8 text-center text-sm text-muted';

  return (
    <section className="panel">
      <div className="mb-6 border-b border-slate-200 pb-5">
        <h3 className="text-lg font-semibold text-slate-900">LMS</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Course tools in one place. Pick a course, then use the tabs below.
        </p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Course
          <select
            className="input mt-1.5 max-w-xl"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            <option value="">Select a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.code})
              </option>
            ))}
          </select>
        </label>
        {selectedCourse ? (
          <p className="mt-2 text-xs text-muted">
            Working in <span className="font-medium text-slate-700">{selectedCourse.title}</span>
          </p>
        ) : null}
      </div>

      <div
        className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-px"
        role="tablist"
        aria-label="LMS sections"
      >
        {LMS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={lmsTab === t.id}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              lmsTab === t.id
                ? 'border border-b-0 border-slate-200 bg-white text-slate-900'
                : 'border border-transparent text-muted hover:bg-slate-50 hover:text-slate-800'
            }`}
            onClick={() => setLmsTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!selectedCourseId ? (
        <div className={lmsMutedBox}>Select a course above to load modules, assignments, and the rest.</div>
      ) : null}

      {selectedCourseId && lmsTab === 'course' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Modules</p>
            <ul className="space-y-2">
              {modules.length ? (
                modules.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium text-slate-800">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted">{(m.items || []).length} items</span>
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-muted">
                  No modules for this course yet.
                </li>
              )}
            </ul>
          </div>
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Gradebook</p>
            <ul className="space-y-2">
              {gradeRows.length ? (
                gradeRows.slice(0, 14).map((g) => (
                  <li
                    key={g.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-700"
                  >
                    <span className="font-medium">Assignment</span> {g.assignment_id?.slice(0, 8) ?? '—'}
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="font-medium">Grade</span> {g.grade ?? '—'}
                    <span className="mx-2 text-slate-300">·</span>
                    <span className="text-muted">{g.status}</span>
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-muted">
                  No grades yet.
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {selectedCourseId && lmsTab === 'work' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Submit assignment</p>
            <select
              className="input mb-3"
              value={activeAssignmentId}
              onChange={(e) => setActiveAssignmentId(e.target.value)}
            >
              <option value="">Choose an assignment</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <textarea
              className="input min-h-28"
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              placeholder="Paste or type your submission…"
            />
            <button
              className="btn-primary mt-3"
              disabled={!activeAssignmentId || !submissionText.trim()}
              onClick={async () => {
                try {
                  const resp = await fetchWithTimeout('/api/submissions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId: studentId,
                      assignmentId: activeAssignmentId,
                      submissionText,
                    }),
                  });
                  if (!resp.ok) throw new Error('Submission failed.');
                  setSubmissionText('');
                  setNotice?.('Assignment submitted.');
                } catch (e) {
                  setNotice?.(e?.message || 'Could not submit assignment.');
                }
              }}
            >
              Submit
            </button>
          </div>
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Quiz attempt</p>
            <p className="mb-3 text-xs text-muted">Record a score for a course quiz (demo flow).</p>
            <select className="input mb-3" value={activeQuizId} onChange={(e) => setActiveQuizId(e.target.value)}>
              <option value="">Choose a quiz</option>
              {courseQuizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.difficulty})
                </option>
              ))}
            </select>
            <input
              className="input mb-3"
              placeholder="Score (0–100)"
              value={quizScore}
              onChange={(e) => setQuizScore(e.target.value)}
            />
            <button
              className="btn-primary"
              disabled={!activeQuizId || quizScore === ''}
              onClick={async () => {
                try {
                  const resp = await fetchWithTimeout('/api/quizzes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'attempt',
                      userId: studentId,
                      courseId: selectedCourseId,
                      quizId: activeQuizId,
                      score: Number(quizScore),
                      answers: [],
                    }),
                  });
                  if (!resp.ok) throw new Error('Could not submit quiz attempt.');
                  setQuizScore('');
                  setNotice?.('Quiz attempt saved.');
                } catch (e) {
                  setNotice?.(e?.message || 'Could not save quiz attempt.');
                }
              }}
            >
              Save attempt
            </button>
            {!courseQuizzes.length ? (
              <p className="mt-4 text-center text-sm text-muted">No quizzes in this course.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedCourseId && lmsTab === 'discuss' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Discussions</p>
            <label className="mb-3 block text-xs font-medium text-slate-600">
              Your reply (used with Reply on a topic)
              <textarea
                className="input mt-1 min-h-20"
                placeholder="Write a reply, then press Reply on a discussion below."
                value={discussionText}
                onChange={(e) => setDiscussionText(e.target.value)}
              />
            </label>
            <ul className="space-y-3">
              {discussions.length ? (
                discussions.map((d) => (
                  <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <p className="font-medium text-slate-800">{d.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{(d.replies || []).length} replies</p>
                    <button
                      type="button"
                      className="btn-ghost mt-2 !px-2 !py-1 text-xs"
                      disabled={!discussionText.trim()}
                      onClick={async () => {
                        if (!discussionText.trim()) return;
                        try {
                          const resp = await fetchWithTimeout('/api/discussions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              userId: studentId,
                              courseId: selectedCourseId,
                              discussionId: d.id,
                              body: discussionText,
                            }),
                          });
                          if (!resp.ok) throw new Error('Reply failed.');
                          setDiscussionText('');
                          setNotice?.('Reply posted.');
                        } catch (e) {
                          setNotice?.(e?.message || 'Could not post discussion reply.');
                        }
                      }}
                    >
                      Reply to this topic
                    </button>
                  </li>
                ))
              ) : (
                <li className={lmsMutedBox}>No discussions yet.</li>
              )}
            </ul>
          </div>
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Inbox</p>
            <select className="input mb-3" value={activeThreadId} onChange={(e) => setActiveThreadId(e.target.value)}>
              <option value="">Select a thread</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subject}
                </option>
              ))}
            </select>
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm">
              {threadMessages.length ? (
                threadMessages.map((m) => (
                  <p key={m.id} className="leading-snug">
                    <span className="font-medium text-slate-800">
                      {m.sender_id === studentId ? 'You' : 'Peer'}
                    </span>
                    <span className="text-muted"> · </span>
                    {m.body}
                  </p>
                ))
              ) : (
                <p className="text-center text-sm text-muted">No messages in this thread.</p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <input
                className="input flex-1"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Message…"
              />
              <button
                type="button"
                className="btn-primary shrink-0"
                disabled={!activeThreadId || !messageText.trim()}
                onClick={async () => {
                  try {
                    const resp = await fetchWithTimeout('/api/messages', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: studentId,
                        threadId: activeThreadId,
                        body: messageText,
                      }),
                    });
                    if (!resp.ok) throw new Error('Could not send message.');
                    const data = await resp.json();
                    setMessages((prev) => [...prev, data.message]);
                    setMessageText('');
                  } catch (e) {
                    setNotice?.(e?.message || 'Could not send message.');
                  }
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedCourseId && lmsTab === 'planner' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Calendar</p>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Event title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
              <input className="input" type="datetime-local" value={newEventDate} onChange={(e) => setNewEventDate(e.target.value)} />
              <button
                type="button"
                className="btn-primary"
                disabled={!newEventTitle.trim() || !newEventDate}
                onClick={async () => {
                  try {
                    const resp = await fetchWithTimeout('/api/calendar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: studentId,
                        courseId: selectedCourseId || null,
                        title: newEventTitle,
                        startAt: new Date(newEventDate).toISOString(),
                        eventType: 'deadline',
                      }),
                    });
                    if (!resp.ok) throw new Error('Could not save event.');
                    const data = await resp.json();
                    setEvents((prev) =>
                      [...prev, data.event].sort(
                        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
                      ),
                    );
                    setNewEventTitle('');
                    setNewEventDate('');
                  } catch (e) {
                    setNotice?.(e?.message || 'Could not save event.');
                  }
                }}
              >
                Add event
              </button>
            </div>
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              {events.slice(0, 10).map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{ev.title}</span>
                  <span className="text-xs text-muted">{new Date(ev.start_at).toLocaleString()}</span>
                </li>
              ))}
              {!events.length ? <li className="text-center text-sm text-muted">No upcoming events.</li> : null}
            </ul>
          </div>
          <div className={lmsCardClass}>
            <p className={lmsCardTitle}>Notifications</p>
            <ul className="space-y-2">
              {notifications.length ? (
                notifications.slice(0, 14).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm leading-snug"
                  >
                    <span className="font-medium text-slate-800">{n.title}</span>
                    <span className="text-muted"> · {n.kind}</span>
                  </li>
                ))
              ) : (
                <li className={lmsMutedBox}>No notifications.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Quizzes({ config, setConfig, onGenerate, results, isGenerating, activeSourceId = null }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});

  const visibleResults = useMemo(() => {
    if (!activeSourceId) return results;
    return results.filter((r) => !r.sourceId || r.sourceId === activeSourceId);
  }, [results, activeSourceId]);

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
        {visibleResults.map((r) => {
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
      {!visibleResults.length ? (
        <p className="text-sm text-muted">
          {results.length && activeSourceId
            ? 'No quizzes saved for the PDF selected in Ingest. Generate one below.'
            : 'Generate a quiz from the PDF selected in Ingest.'}
        </p>
      ) : null}
    </section>
  );
}

function Chat({ room, setRoom, messages, setMessages, studentId, setNotice }) {
  const [text, setText] = useState('');
  const rooms = ['global', 'private', 'class-group'];
  const roomMessages = messages.filter((m) => m.room === room);
  return (
    <section className="panel">
      <h3 className="mb-3 text-lg font-semibold">Class Collaboration Chat</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input" value={room} onChange={(e) => setRoom(e.target.value)}>{rooms.map((r) => <option key={r}>{r}</option>)}</select>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type message..." />
        <button
          className="btn-primary"
          onClick={async () => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const localMessage = { id: Date.now(), room, text: trimmed, sender: 'You' };
            setMessages((p) => [...p, localMessage]);
            setText('');
            if (studentId) {
              try {
                const data = await saveChatMessageToLibrary({ studentId, room, content: trimmed });
                if (data?.message?.id) {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === localMessage.id ? { ...m, id: data.message.id } : m)),
                  );
                }
              } catch {
                setNotice?.('Message sent locally, but failed to persist chat history.');
              }
            }
          }}
        >
          Send
        </button>
      </div>
      <ul className="space-y-2">{roomMessages.map((m) => <li key={m.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm"><b>{m.sender}:</b> {m.text}</li>)}</ul>
    </section>
  );
}

function Presentations({ presentations, setPresentations, onGenerate, isGenerating, chunks, activeChunkId = '' }) {
  const [topic, setTopic] = useState('My Project');
  const [promptText, setPromptText] = useState('Create a classroom-ready deck with examples and references.');
  const [selectedChunkIds, setSelectedChunkIds] = useState([]);
  const [previewId, setPreviewId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [slideThumbByIndex, setSlideThumbByIndex] = useState({});
  const [slideThumbsLoading, setSlideThumbsLoading] = useState(false);
  const hasChunks = chunks.length > 0;

  useEffect(() => {
    if (!activeChunkId || !chunks.some((c) => c.id === activeChunkId)) return;
    setSelectedChunkIds([activeChunkId]);
  }, [activeChunkId, chunks]);

  useEffect(() => {
    const pres = presentations.find((p) => p.id === previewId);
    if (!pres?.slides?.length) {
      setSlideThumbByIndex({});
      setSlideThumbsLoading(false);
      return;
    }
    let cancelled = false;
    const deck = pres.title || '';
    setSlideThumbsLoading(true);
    setSlideThumbByIndex({});
    (async () => {
      const next = {};
      for (let idx = 0; idx < pres.slides.length; idx += 1) {
        if (cancelled) return;
        const s = pres.slides[idx];
        next[idx] = await fetchSlideHeroImageUrl(deck, idx, s);
      }
      if (!cancelled) {
        setSlideThumbByIndex(next);
        setSlideThumbsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewId, presentations]);

  const fallbackChunk = chunks.find((c) => c.id === activeChunkId) || chunks[0];
  const selectedChunks = selectedChunkIds.length
    ? chunks.filter((c) => selectedChunkIds.includes(c.id))
    : (fallbackChunk ? [fallbackChunk] : []);
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
        chartBars: slideChartBarsAreValid(s.chartBars, s) ? s.chartBars : undefined,
        imageSearchQuery: String(s.imageSearchQuery || '').trim().slice(0, 220),
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
          slides: draft.slides.map((s, idx) => {
            const title = s.title.trim() || `Slide ${idx + 1}`;
            const bullets = s.bulletsText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 6);
            const slideLike = { title, bullets, chartBars: s.chartBars };
            const iq = String(s.imageSearchQuery || '').trim().slice(0, 220);
            return {
              title,
              bullets,
              notes: s.notes.trim(),
              imageSuggestion: s.imageSuggestion.trim(),
              graphSuggestion: s.graphSuggestion.trim(),
              ...(iq ? { imageSearchQuery: iq } : {}),
              ...(slideChartBarsAreValid(s.chartBars, slideLike) ? { chartBars: s.chartBars } : {}),
            };
          }),
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
            chunkIds: selectedChunkIds.length
              ? selectedChunkIds
              : activeChunkId && chunks.some((c) => c.id === activeChunkId)
                ? [activeChunkId]
                : chunks[0]
                  ? [chunks[0].id]
                  : [],
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
            {previewPresentation.slides.map((s, idx) => {
              const slideChartData = buildSlideChartJsData(s);
              return (
              <div key={`${previewPresentation.id}-preview-${idx}`} className="rounded-xl border border-border bg-white p-3 shadow-sm">
                <p className="text-base font-semibold">{idx + 1}. {s.title}</p>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                  {(s.bullets || []).map((b, i) => <li key={`${previewPresentation.id}-${idx}-b-${i}`}>{b}</li>)}
                </ul>
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium text-muted">Visual (illustrative)</p>
                    {slideThumbsLoading && !slideThumbByIndex[idx] ? (
                      <div className="flex h-44 w-full items-center justify-center rounded-md border border-border bg-slate-100 text-xs text-muted">
                        Loading image…
                      </div>
                    ) : (
                      <img
                        src={slideThumbByIndex[idx] || slideHeroImageUrl(previewPresentation.title, idx, s.title)}
                        alt=""
                        loading="lazy"
                        className="h-44 w-full rounded-md border border-border object-cover"
                      />
                    )}
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Search uses slide keywords (Commons when available); otherwise a stable placeholder for this slide, not a topic illustration. AI suggestion:{' '}
                      {s.imageSuggestion || '—'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-slate-50 p-2">
                    <p className="mb-1 text-xs font-medium text-muted">Graph</p>
                    {slideChartData ? (
                      <>
                        <div className="h-44">
                          <Bar
                            data={slideChartData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: false },
                                title: {
                                  display: true,
                                  text: (s.graphSuggestion && String(s.graphSuggestion).slice(0, 80)) || 'Values from slide outline',
                                  font: { size: 11 },
                                  color: '#64748b',
                                  padding: { bottom: 4 },
                                },
                              },
                              scales: { y: { beginAtZero: true } },
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-muted">
                          Bars use numbers from the generated outline only when the source slide includes explicit comparable values.
                        </p>
                      </>
                    ) : (
                      <div className="py-4 text-center text-xs text-muted">
                        <p>No numeric comparison on this slide.</p>
                        {s.graphSuggestion ? (
                          <p className="mt-2 text-left leading-snug">
                            <span className="font-medium text-slate-600">Chart idea (text only): </span>
                            {s.graphSuggestion}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                {s.notes ? <p className="mt-2 text-xs text-muted">Notes: {s.notes}</p> : null}
              </div>
              );
            })}
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
  onPersistGrade,
  onPersistSimulation,
}) {
  const [subject, setSubject] = useState('Math');
  const [score, setScore] = useState(85);
  const [weight, setWeight] = useState(0.4);
  const [target, setTarget] = useState(90);
  const [finalWeight, setFinalWeight] = useState(0.5);
  const [projectedFinal, setProjectedFinal] = useState(75);
  const [advice, setAdvice] = useState(null);
  const add = async () => {
    const newGrade = { id: Date.now(), subject, score: Number(score), weight: Number(weight) };
    setGrades([newGrade, ...grades]);
    if (onPersistGrade) {
      try {
        const data = await onPersistGrade({
          subject: newGrade.subject,
          score: newGrade.score,
          weight: newGrade.weight,
        });
        if (data?.grade?.id) {
          setGrades((prev) => prev.map((g) => (g.id === newGrade.id ? { ...g, id: data.grade.id } : g)));
        }
      } catch {
        // Keep local state if network persistence fails.
      }
    }
  };
  const simulate = async () => {
    const req = finalWeight <= 0 ? 0 : Math.max(0, Math.min(100, (target - avg * (1 - finalWeight)) / finalWeight));
    const row = { id: Date.now(), req, target };
    setSimulations([row, ...simulations]);
    if (onPersistSimulation) {
      try {
        const data = await onPersistSimulation({
          target: row.target,
          requiredFinal: row.req,
          finalWeight: Number(finalWeight || 0),
        });
        if (data?.simulation?.id) {
          setSimulations((prev) => prev.map((s) => (s.id === row.id ? { ...s, id: data.simulation.id } : s)));
        }
      } catch {
        // Keep local state if network persistence fails.
      }
    }
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
              const row = { id: Date.now(), req: Number(data.requiredFinal), target };
              setSimulations((prev) => [row, ...prev]);
              if (onPersistSimulation) {
                try {
                  const saved = await onPersistSimulation({
                    target: row.target,
                    requiredFinal: row.req,
                    finalWeight: Number(finalWeight || 0),
                  });
                  if (saved?.simulation?.id) {
                    setSimulations((prev) => prev.map((s) => (s.id === row.id ? { ...s, id: saved.simulation.id } : s)));
                  }
                } catch {
                  // Keep local state if network persistence fails.
                }
              }
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

function AiTutor({ tutorMessages, setTutorMessages, onAsk, isBusy, streamingPreview = '', chunks = [], onNotify, studentId }) {
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [voiceInputDisabled, setVoiceInputDisabled] = useState(false);

  const voiceHttpsOk =
    typeof window === 'undefined' ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const startVoiceInput = () => {
    if (voiceInputDisabled) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg =
        'Voice input is not available in this browser. Use Chrome or Edge on desktop, or ensure the page is served over HTTPS (localhost is OK).';
      setVoiceHint(msg);
      return;
    }
    if (!voiceHttpsOk) {
      setVoiceHint('Voice input usually requires HTTPS (except on localhost). Type your question below instead.');
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
      if (code === 'not-allowed') {
        setVoiceHint('Microphone access was blocked. You can still type your question in the box below.');
        setVoiceInputDisabled(true);
        return;
      }
      if (code === 'network') {
        setVoiceHint(
          'Voice recognition could not reach Google’s speech service (network or browser policy). Typing works the same — use the text box below.',
        );
        setVoiceInputDisabled(true);
        return;
      }
      setVoiceHint(`Voice input paused (${code}). Type below instead, or refresh the page to try again.`);
    };
    try {
      rec.start();
    } catch (e) {
      setIsListening(false);
      setVoiceHint(e?.message || 'Could not start speech recognition. Type your question below.');
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
        Powered by Ollama. Uses the PDF currently selected in Ingest for context
        {chunks[0] ? ` (${chunks[0].name})` : ' — upload PDFs in Ingest and select one for source-grounded answers.'}.
      </p>
      <p className="mb-2 text-[11px] leading-snug text-muted">
        Tip: type your question in the box below. Push-to-talk is optional and needs a working mic and network in some browsers.
      </p>
      {voiceHint ? (
        <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">{voiceHint}</p>
      ) : null}
      <textarea className="input min-h-24" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask study guidance..." />
      {isBusy && streamingPreview ? (
        <div
          className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-canvas-primary/30 bg-[#f0f7fc] px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap"
          aria-live="polite"
        >
          <span className="text-xs font-medium text-canvas-primary">Streaming…</span>
          <br />
          {streamingPreview}
        </div>
      ) : null}
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
            const localPair = { id: Date.now(), you, tutor };
            setTutorMessages((prev) => [...prev, localPair]);
            if (studentId) {
              try {
                await saveTutorPairToLibrary({ studentId, prompt: you, reply: tutor });
              } catch {
                onNotify?.('Tutor answer saved locally, but cloud persistence failed.');
              }
            }
            speakText(tutor);
          }}
        >
          {isBusy ? 'Thinking...' : 'Ask Tutor'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={startVoiceInput}
          disabled={isListening || isBusy || voiceInputDisabled}
          title={voiceInputDisabled ? 'Voice input disabled after an error; refresh to retry.' : undefined}
        >
          {voiceInputDisabled ? 'Voice off' : isListening ? 'Listening...' : 'Push-to-talk'}
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
