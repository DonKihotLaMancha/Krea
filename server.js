import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL_RAW = String(process.env.OLLAMA_URL || '').trim();
const OLLAMA_URL = OLLAMA_URL_RAW || 'http://127.0.0.1:11434';
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || '').trim();
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
const OLLAMA_HEALTH_TIMEOUT_MS = Number(process.env.OLLAMA_HEALTH_TIMEOUT_MS || 20000);

function ollamaHeadersJson() {
  const h = { 'Content-Type': 'application/json' };
  if (OLLAMA_API_KEY) h.Authorization = `Bearer ${OLLAMA_API_KEY}`;
  return h;
}

/** GET /api/tags — avoid Content-Type on GET (some hosts are picky). */
function ollamaHeadersForGet() {
  if (!OLLAMA_API_KEY) return {};
  return { Authorization: `Bearer ${OLLAMA_API_KEY}` };
}

function isOllamaCloudUrl(url) {
  return String(url || '').toLowerCase().includes('ollama.com');
}
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
/** Vercel account API token (e.g. deployments API). Server-only — do not expose to the client. */
const VERCEL_API_KEY = String(process.env.VERCEL_API_KEY || '').trim();
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  const reqId = crypto.randomUUID();
  const started = Date.now();
  req.requestId = reqId;
  res.setHeader('x-request-id', reqId);
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    if (req.path.startsWith('/api/')) {
      console.log(`[api] ${reqId} ${req.method} ${req.path} -> ${res.statusCode} (${elapsed}ms)`);
    }
  });
  next();
});

/** Values safe for the browser (anon key + project URL). Used by /api/client-env and /api/env.js. */
function browserSupabasePublicEnv() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    '';
  return {
    supabaseUrl: String(supabaseUrl).trim(),
    supabaseAnonKey: String(supabaseAnonKey).trim(),
  };
}

function requireSupabase(res) {
  if (supabase) return true;
  res.status(500).json({
    error: 'Supabase is not configured.',
    details: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your server environment.',
  });
  return false;
}

function formatSupabaseError(error, fallbackMessage = 'Database operation failed.') {
  if (!error) return { error: fallbackMessage };
  const details = {
    message: error.message || String(error),
    details: error.details || null,
    hint: error.hint || null,
    code: error.code || null,
  };
  return { error: fallbackMessage, details };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

async function tryTableExists(tableName) {
  if (!supabase) return false;
  const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true }).limit(1);
  return !error;
}

async function ensureProfile(studentId, name = 'Student') {
  const { error } = await supabase.from('profiles').upsert(
    { id: studentId, display_name: name },
    { onConflict: 'id' },
  );
  if (error) throw error;
  // Keep legacy student profile row in sync for compatibility.
  const { error: legacyStudentErr } = await supabase
    .from('students')
    .insert({ id: studentId, name });
  // Legacy table may not exist yet in some deployments; keep core flow working.
  if (legacyStudentErr && !['42P01', '23505'].includes(String(legacyStudentErr.code || ''))) throw legacyStudentErr;
}

async function createDefaultNotebookSession(studentId) {
  const { data: existing, error: existingError } = await supabase
    .from('notebook_sessions')
    .select('id')
    .eq('owner_id', studentId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.[0]?.id) return existing[0].id;
  const { data, error } = await supabase
    .from('notebook_sessions')
    .insert({ owner_id: studentId, title: 'Default notebook session' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function getOrCreateOwnerChatRoom(ownerId, roomName = 'global') {
  const normalizedName = String(roomName || 'global').trim().toLowerCase() || 'global';
  const roomType = normalizedName === 'private' ? 'private' : normalizedName === 'class-group' ? 'class' : 'global';
  const { data: existing, error: existingErr } = await supabase
    .from('chat_rooms')
    .select('id,name,room_type')
    .eq('owner_id', ownerId)
    .eq('name', normalizedName)
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing?.[0]?.id) return existing[0];
  const { data: created, error: createErr } = await supabase
    .from('chat_rooms')
    .insert({ owner_id: ownerId, name: normalizedName, room_type: roomType })
    .select('id,name,room_type')
    .single();
  if (createErr) throw createErr;
  const { error: memberErr } = await supabase
    .from('chat_members')
    .upsert({ room_id: created.id, user_id: ownerId, role: 'owner' }, { onConflict: 'room_id,user_id' });
  if (memberErr) throw memberErr;
  return created;
}

async function getOrCreateTutorConversation(ownerId) {
  const { data: existing, error: existingErr } = await supabase
    .from('tutor_conversations')
    .select('id,title')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing?.[0]?.id) return existing[0].id;
  const { data: created, error: createErr } = await supabase
    .from('tutor_conversations')
    .insert({ owner_id: ownerId, title: 'AI Tutor' })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

async function resolveSourceIdByName(studentId, sourceName) {
  const title = String(sourceName || '').trim();
  if (!title) return null;
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('owner_id', studentId)
    .eq('title', title)
    .eq('source_type', 'pdf')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}

async function ensureTeacherOwnsClass(teacherId, classId) {
  const { data, error } = await supabase
    .from('teacher_classes')
    .select('id,name')
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .limit(1);
  if (error) throw error;
  if (!data?.[0]) {
    throw new Error('Class not found or not owned by this teacher.');
  }
  return data[0];
}

async function ensureCourseOwner(userId, courseId) {
  const { data, error } = await supabase
    .from('lms_courses')
    .select('id,title,owner_teacher_id')
    .eq('id', courseId)
    .eq('owner_teacher_id', userId)
    .limit(1);
  if (error) throw error;
  if (!data?.[0]) throw new Error('Course not found or not owned by this teacher.');
  return data[0];
}

async function ensureCourseMember(userId, courseId) {
  const { data: owned, error: ownErr } = await supabase
    .from('lms_courses')
    .select('id,title')
    .eq('id', courseId)
    .eq('owner_teacher_id', userId)
    .limit(1);
  if (ownErr) throw ownErr;
  if (owned?.[0]) return { role: 'teacher', course: owned[0] };

  const { data: enrollments, error: enrErr } = await supabase
    .from('lms_enrollments')
    .select('id,role,status,lms_courses!lms_enrollments_course_id_fkey(id,title)')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (enrErr) throw enrErr;
  const row = enrollments?.[0];
  if (!row) throw new Error('Course not found or access denied.');
  return {
    role: row.role,
    course: Array.isArray(row.lms_courses) ? row.lms_courses[0] : row.lms_courses,
  };
}

async function logLmsAudit({ actorId, action, entityType, entityId = null, payload = {} }) {
  if (!actorId) return;
  try {
    await supabase.from('lms_audit_events').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload,
    });
  } catch {
    // non-blocking audit logging
  }
}

function ollamaBasesToTry() {
  const raw = [OLLAMA_URL];
  // On Render, localhost has no Ollama — only try the configured URL.
  if (!process.env.RENDER) {
    raw.push('http://127.0.0.1:11434', 'http://localhost:11434');
  }
  const seen = new Set();
  const out = [];
  for (const u of raw) {
    const s = String(u || '').trim().replace(/\/$/, '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function fetchOllamaTags(base, timeoutMs = OLLAMA_HEALTH_TIMEOUT_MS) {
  const url = `${base}/api/tags`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: c.signal, headers: ollamaHeadersForGet() });
    return { ok: resp.ok, status: resp.status };
  } finally {
    clearTimeout(t);
  }
}

app.get('/api/health', async (_req, res) => {
  const deployHost = process.env.RENDER ? 'render' : undefined;

  if (process.env.RENDER && !OLLAMA_URL_RAW) {
    return res.status(503).json({
      ok: false,
      error: 'OLLAMA_URL is not set on this host.',
      detail: 'Add OLLAMA_URL (e.g. https://ollama.com) in Render → Environment and redeploy.',
      hint: 'render_needs_ollama_url',
      deployHost,
      model: OLLAMA_MODEL,
    });
  }

  if (isOllamaCloudUrl(OLLAMA_URL_RAW || OLLAMA_URL) && !OLLAMA_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'Ollama Cloud requires an API key.',
      detail: 'Set OLLAMA_API_KEY in Render (secret) from https://ollama.com/settings/keys',
      hint: 'missing_ollama_api_key',
      deployHost,
      model: OLLAMA_MODEL,
    });
  }

  let lastErr = '';
  for (const base of ollamaBasesToTry()) {
    try {
      const { ok, status } = await fetchOllamaTags(base);
      if (ok) {
        return res.json({
          ok: true,
          model: OLLAMA_MODEL,
          ollamaBase: base,
          deployHost,
        });
      }
      lastErr = `HTTP ${status} from ${base}`;
      if (status === 401 || status === 403) {
        lastErr += ' — check OLLAMA_API_KEY and model access on ollama.com';
      }
    } catch (e) {
      lastErr = e?.name === 'AbortError' ? `timeout ${base}` : `${base}: ${e?.message || e}`;
    }
  }
  console.warn('[api/health] Ollama unreachable — is Ollama running? Is the API server running (npm run server)?', lastErr);
  return res.status(503).json({
    ok: false,
    error: 'Ollama is not reachable from the API server.',
    detail: lastErr,
    hint: 'ollama_unreachable',
    deployHost,
    model: OLLAMA_MODEL,
  });
});

/** JSON for fetch-based bootstrapping. */
app.get('/api/client-env', (_req, res) => {
  const { supabaseUrl, supabaseAnonKey } = browserSupabasePublicEnv();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ supabaseUrl, supabaseAnonKey });
});

/**
 * Sync script for index.html — runs before the Vite bundle so Supabase is configured without relying on fetch
 * (avoids SW / timing issues on hosts like Render).
 */
app.get('/api/env.js', (_req, res) => {
  const { supabaseUrl, supabaseAnonKey } = browserSupabasePublicEnv();
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(`window.__SA_ENV__=${JSON.stringify({ supabaseUrl, supabaseAnonKey })};`);
});

app.post('/api/student', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const name = String(req.body?.name || 'Student').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing studentId.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId, name);
    // Legacy compatibility table remains optional.
    const hasLegacyStudents = await tryTableExists('students');
    if (hasLegacyStudents) {
      const { error } = await supabase
        .from('students')
        .upsert({ id: studentId, name }, { onConflict: 'id' });
      if (error) throw error;
    }
    return res.json({ ok: true, studentId, name });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save student.'));
  }
});

app.get('/api/library', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.query?.studentId || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing studentId.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    const [
      { data: sources, error: srcErr },
      { data: maps, error: mapsErr },
      { data: notebook, error: notebookErr },
      { data: flashcardSets, error: flashcardSetsErr },
      { data: flashcardsRows, error: flashcardsErr },
      { data: quizRows, error: quizErr },
      { data: quizQuestionRows, error: quizQuestionsErr },
      { data: presentationsRows, error: presentationsErr },
      { data: presentationSlidesRows, error: presentationSlidesErr },
      { data: presentationRefsRows, error: presentationRefsErr },
      { data: gradesRows, error: gradesErr },
      { data: simRows, error: simErr },
      { data: chatRoomsRows, error: chatRoomsErr },
      { data: chatMessagesRows, error: chatMessagesErr },
      { data: tutorConversationsRows, error: tutorConversationsErr },
      { data: tutorMessagesRows, error: tutorMessagesErr },
      { data: sectionsRows, error: sectionsErr },
    ] = await Promise.all([
      supabase
        .from('sources')
        .select('id,title,created_at,source_contents(cleaned_text)')
        .eq('owner_id', studentId)
        .eq('source_type', 'pdf')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('concept_maps')
        .select('id,title,created_at,concept_map_nodes(id,label,description),concept_map_edges(id,source_node_id,target_node_id,label)')
        .eq('owner_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notebook_outputs')
        .select('id,output_type,payload,created_at')
        .eq('owner_id', studentId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('flashcard_sets')
        .select('id,name,source_id,created_at')
        .eq('owner_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('flashcards')
        .select('id,set_id,question,answer,created_at')
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('quizzes')
        .select('id,mode,difficulty,question_count,created_at')
        .eq('owner_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('quiz_questions')
        .select('id,quiz_id,question,options,correct_answer')
        .limit(3000),
      supabase
        .from('presentations')
        .select('id,title,created_at')
        .eq('owner_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('presentation_slides')
        .select('id,presentation_id,slide_index,title,bullets,notes,image_suggestion,graph_suggestion')
        .order('slide_index', { ascending: true })
        .limit(3000),
      supabase
        .from('presentation_references')
        .select('id,presentation_id,ref_text,url')
        .limit(3000),
      supabase
        .from('grades')
        .select('id,subject,score,weight,recorded_at')
        .eq('owner_id', studentId)
        .order('recorded_at', { ascending: false })
        .limit(200),
      supabase
        .from('grade_simulations')
        .select('id,target,required_final,created_at')
        .eq('owner_id', studentId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('chat_rooms')
        .select('id,name')
        .eq('owner_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('chat_messages')
        .select('id,room_id,sender_id,content,created_at')
        .eq('sender_id', studentId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('tutor_conversations')
        .select('id')
        .eq('owner_id', studentId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('tutor_messages')
        .select('id,conversation_id,role,content,created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('sections')
        .select('id,name,description,progress_percent,status,source_id,created_at,sources(title)')
        .order('created_at', { ascending: false })
        .limit(300),
    ]);
    if (
      srcErr || mapsErr || notebookErr || flashcardSetsErr || flashcardsErr || quizErr || quizQuestionsErr ||
      presentationsErr || presentationSlidesErr || presentationRefsErr || gradesErr || simErr || chatRoomsErr ||
      chatMessagesErr || tutorConversationsErr || tutorMessagesErr || sectionsErr
    ) {
      throw (
        srcErr || mapsErr || notebookErr || flashcardSetsErr || flashcardsErr || quizErr || quizQuestionsErr ||
        presentationsErr || presentationSlidesErr || presentationRefsErr || gradesErr || simErr || chatRoomsErr ||
        chatMessagesErr || tutorConversationsErr || tutorMessagesErr || sectionsErr
      );
    }
    const sourcePdfs = (sources || []).map((s) => {
        const sc = s.source_contents;
        const text = Array.isArray(sc) ? sc[0]?.cleaned_text : sc?.cleaned_text;
        return {
          id: s.id,
          name: s.title,
          content: text || '',
          createdAt: s.created_at,
        };
      });
    let pdfs = sourcePdfs;
    if (!pdfs.length) {
      const { data: legacyPdfs, error: legacyErr } = await supabase
        .from('student_pdfs')
        .select('id,name,content,created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (legacyErr) throw legacyErr;
      pdfs = (legacyPdfs || []).map((p) => ({
        id: p.id,
        name: p.name,
        content: p.content || '',
        createdAt: p.created_at,
      }));
    }
    const flashcardSetIds = new Set((flashcardSets || []).map((s) => s.id));
    const flashcards = (flashcardsRows || [])
      .filter((c) => flashcardSetIds.has(c.set_id))
      .map((c) => ({
        id: c.id,
        setId: c.set_id,
        question: c.question,
        answer: c.answer,
      }));

    const quizIds = new Set((quizRows || []).map((q) => q.id));
    const groupedQuizQuestions = new Map();
    for (const row of quizQuestionRows || []) {
      if (!quizIds.has(row.quiz_id)) continue;
      if (!groupedQuizQuestions.has(row.quiz_id)) groupedQuizQuestions.set(row.quiz_id, []);
      const options = Array.isArray(row.options) ? row.options : [];
      const correctAnswer = String(row.correct_answer || '');
      let correctIndex = options.findIndex((o) => String(o) === correctAnswer);
      if (correctIndex < 0) correctIndex = 0;
      groupedQuizQuestions.get(row.quiz_id).push({
        id: row.id,
        prompt: row.question,
        choices: options.map((o) => String(o)),
        correctIndex,
      });
    }
    const quizzes = (quizRows || []).map((q) => ({
      id: q.id,
      topic: `${String(q.mode || 'quiz').toUpperCase()} Quiz`,
      total: Number(q.question_count || 0),
      correct: 0,
      sec: Math.max(120, Number(q.question_count || 0) * 45),
      difficulty: q.difficulty || 'medium',
      questions: groupedQuizQuestions.get(q.id) || [],
    }));

    const presentationIds = new Set((presentationsRows || []).map((p) => p.id));
    const groupedSlides = new Map();
    for (const slide of presentationSlidesRows || []) {
      if (!presentationIds.has(slide.presentation_id)) continue;
      if (!groupedSlides.has(slide.presentation_id)) groupedSlides.set(slide.presentation_id, []);
      groupedSlides.get(slide.presentation_id).push({
        title: slide.title,
        bullets: Array.isArray(slide.bullets) ? slide.bullets.map((b) => String(b)) : [],
        notes: slide.notes || '',
        imageSuggestion: slide.image_suggestion || '',
        graphSuggestion: slide.graph_suggestion || '',
      });
    }
    const groupedRefs = new Map();
    for (const ref of presentationRefsRows || []) {
      if (!presentationIds.has(ref.presentation_id)) continue;
      if (!groupedRefs.has(ref.presentation_id)) groupedRefs.set(ref.presentation_id, []);
      groupedRefs.get(ref.presentation_id).push({ text: ref.ref_text, url: ref.url || '' });
    }
    const presentations = (presentationsRows || []).map((p) => ({
      id: p.id,
      title: p.title,
      slides: groupedSlides.get(p.id) || [],
      references: groupedRefs.get(p.id) || [],
    }));

    const chatRoomNameById = new Map((chatRoomsRows || []).map((r) => [r.id, r.name || 'global']));
    const chatMessages = (chatMessagesRows || [])
      .filter((m) => chatRoomNameById.has(m.room_id))
      .map((m) => ({
        id: m.id,
        room: chatRoomNameById.get(m.room_id),
        text: m.content || '',
        sender: 'You',
      }))
      .reverse();

    const tutorConversationIds = new Set((tutorConversationsRows || []).map((c) => c.id));
    const tutorRows = (tutorMessagesRows || [])
      .filter((m) => tutorConversationIds.has(m.conversation_id))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const tutorMessages = [];
    let pendingUser = null;
    for (const row of tutorRows) {
      if (row.role === 'user') {
        pendingUser = { id: row.id, you: row.content };
      } else if (row.role === 'assistant' && pendingUser) {
        tutorMessages.push({ id: `${pendingUser.id}-${row.id}`, you: pendingUser.you, tutor: row.content || '' });
        pendingUser = null;
      }
    }

    const sections = (sectionsRows || []).map((s) => ({
      id: s.id,
      nombre: s.name,
      descripcion: s.description || '',
      porcentaje: Number(s.progress_percent || 0),
      estado: String(s.status || 'pending')
        .replace('pending', 'pendiente')
        .replace('in_progress', 'en_progreso')
        .replace('completed', 'completado'),
      fechas_trabajo: [],
      sourceName: Array.isArray(s.sources) ? s.sources[0]?.title : s.sources?.title || null,
    }));

    return res.json({
      pdfs,
      maps: (maps || []).map((m) => ({
        title: m.title,
        id: m.id,
        createdAt: m.created_at,
        map: {
          title: m.title,
          nodes: Array.isArray(m.concept_map_nodes) ? m.concept_map_nodes.map((n) => ({
            id: n.id,
            label: n.label,
            description: n.description || '',
          })) : [],
          links: Array.isArray(m.concept_map_edges) ? m.concept_map_edges.map((e) => ({
            source: e.source_node_id,
            target: e.target_node_id,
            label: e.label || '',
          })) : [],
        },
      })),
      notebook: (notebook || []).map((n) => ({
        id: n.id,
        outputType: n.output_type,
        createdAt: n.created_at,
        output: n.payload || {},
      })),
      flashcards: {
        sets: (flashcardSets || []).map((s) => ({ id: s.id, name: s.name, sourceId: s.source_id || null })),
        cards: flashcards,
      },
      quizzes,
      presentations,
      academics: {
        grades: (gradesRows || []).map((g) => ({
          id: g.id,
          subject: g.subject,
          score: Number(g.score || 0),
          weight: Number(g.weight || 0),
        })),
        simulations: (simRows || []).map((s) => ({
          id: s.id,
          req: Number(s.required_final || 0),
          target: Number(s.target || 0),
        })),
      },
      chat: {
        rooms: (chatRoomsRows || []).map((r) => r.name || 'global'),
        messages: chatMessages,
      },
      tutor: {
        messages: tutorMessages,
      },
      sections,
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load library.'));
  }
});

app.post('/api/library/pdf', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const name = String(req.body?.name || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!studentId || !name || !content) return res.status(400).json({ error: 'Missing studentId/name/content.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    // Always create a new source row so every upload is kept (same filename allowed).
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .insert({ owner_id: studentId, title: name, source_type: 'pdf', status: 'ready' })
      .select('id')
      .single();
    if (sourceError) throw sourceError;

    const { error: contentError } = await supabase
      .from('source_contents')
      .insert({ source_id: source.id, raw_text: content, cleaned_text: content });
    if (contentError) throw contentError;

    const { error: legacyErr } = await supabase
      .from('student_pdfs')
      .insert({ student_id: studentId, name, content });
    if (legacyErr) throw legacyErr;
    return res.json({ ok: true, id: source?.id || null });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save PDF.'));
  }
});

app.post('/api/library/concept-map', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const sourceName = String(req.body?.sourceName || '').trim();
  const title = String(req.body?.title || 'Concept Map').trim();
  const map = req.body?.map;
  if (!studentId || !sourceName || !map) return res.status(400).json({ error: 'Missing studentId/sourceName/map.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    let sourceId = null;
    const { data: source } = await supabase
      .from('sources')
      .select('id')
      .eq('owner_id', studentId)
      .eq('title', sourceName)
      .eq('source_type', 'pdf')
      .limit(1);
    sourceId = source?.[0]?.id || null;
    if (!sourceId) {
      const { data: createdSource, error: createdSourceErr } = await supabase
        .from('sources')
        .insert({ owner_id: studentId, title: sourceName, source_type: 'pdf', status: 'ready' })
        .select('id')
        .single();
      if (createdSourceErr) throw createdSourceErr;
      sourceId = createdSource.id;
    }

    const { data, error } = await supabase
      .from('concept_maps')
      .insert({
        owner_id: studentId,
        source_id: sourceId,
        title,
        version: 1,
      })
      .select('id')
      .single();
    if (error) throw error;

    const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
    const links = Array.isArray(map?.links) ? map.links : [];
    const idMap = new Map();
    const nodeRows = nodes.map((n, idx) => {
      const oldKey = String(n.id ?? n.label ?? `idx-${idx}`).trim();
      const newId = crypto.randomUUID();
      idMap.set(oldKey, newId);
      return {
        id: newId,
        map_id: data.id,
        label: String(n.label || 'Concept').trim(),
        description: String(n.description || '').trim(),
      };
    });
    if (nodeRows.length) {
      const { error: nodesErr } = await supabase.from('concept_map_nodes').insert(nodeRows);
      if (nodesErr) throw nodesErr;
    }

    const resolveNodeId = (ref) => {
      const key = String(ref ?? '').trim();
      if (idMap.has(key)) return idMap.get(key);
      if (isUuid(key)) return key;
      return null;
    };
    const edgeRows = links
      .map((l) => {
        const sourceId = resolveNodeId(l.source);
        const targetId = resolveNodeId(l.target);
        if (!sourceId || !targetId) return null;
        return {
          map_id: data.id,
          source_node_id: sourceId,
          target_node_id: targetId,
          label: String(l.label || '').trim(),
        };
      })
      .filter(Boolean);
    if (edgeRows.length) {
      const { error: edgesErr } = await supabase.from('concept_map_edges').insert(edgeRows);
      if (edgesErr) throw edgesErr;
    }

    const hasLegacyConceptMaps = await tryTableExists('concept_maps_legacy');
    if (hasLegacyConceptMaps) {
      await supabase.from('concept_maps_legacy').insert({
        student_id: studentId,
        source_name: sourceName,
        title,
        map_json: JSON.stringify(map),
      });
    }
    return res.json({ ok: true, id: data?.id || null });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save concept map.'));
  }
});

app.post('/api/library/notebook', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const sourceNames = Array.isArray(req.body?.sourceNames) ? req.body.sourceNames : [];
  const outputType = String(req.body?.outputType || '').trim();
  const output = req.body?.output;
  if (!studentId || !outputType || !output) return res.status(400).json({ error: 'Missing studentId/outputType/output.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const sessionId = await createDefaultNotebookSession(studentId);
    const allowedTypes = new Set(['source-chat', 'summary', 'study-guide', 'source-compare', 'audio-overview']);
    const safeType = allowedTypes.has(outputType) ? outputType : 'summary';
    const { data, error } = await supabase
      .from('notebook_outputs')
      .insert({
        session_id: sessionId,
        owner_id: studentId,
        output_type: safeType,
        payload: output,
      })
      .select('id')
      .single();
    if (error) throw error;

    const hasLegacyNotebook = await tryTableExists('notebook_outputs_legacy');
    if (hasLegacyNotebook) {
      await supabase.from('notebook_outputs_legacy').insert({
        student_id: studentId,
        source_names: JSON.stringify(sourceNames),
        output_type: safeType,
        output_json: JSON.stringify(output),
      });
    }
    return res.json({ ok: true, id: data?.id || null });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save notebook output.'));
  }
});

app.post('/api/library/flashcards', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const sourceName = String(req.body?.sourceName || '').trim();
  const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (!studentId || !cards.length) return res.status(400).json({ error: 'Missing studentId/cards.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const sourceId = await resolveSourceIdByName(studentId, sourceName);
    const setName = `${sourceName || 'Study Set'} - ${new Date().toLocaleDateString()}`;
    const { data: setData, error: setErr } = await supabase
      .from('flashcard_sets')
      .insert({
        owner_id: studentId,
        source_id: sourceId,
        name: setName,
        generation_mode: 'ai',
      })
      .select('id')
      .single();
    if (setErr) throw setErr;
    const rows = cards
      .slice(0, 300)
      .map((c) => ({
        set_id: setData.id,
        question: String(c?.question || '').trim(),
        answer: String(c?.answer || '').trim(),
        evidence: String(c?.evidence || '').trim(),
      }))
      .filter((r) => r.question && r.answer);
    if (rows.length) {
      const { error: cardsErr } = await supabase.from('flashcards').insert(rows);
      if (cardsErr) throw cardsErr;
    }
    return res.json({ ok: true, setId: setData.id, count: rows.length });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save flashcards.'));
  }
});

app.post('/api/library/sections', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const sourceName = String(req.body?.sourceName || '').trim();
  const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
  if (!studentId || !sourceName || !sections.length) return res.status(400).json({ error: 'Missing studentId/sourceName/sections.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    let sourceId = await resolveSourceIdByName(studentId, sourceName);
    if (!sourceId) {
      const { data: source, error: srcErr } = await supabase
        .from('sources')
        .insert({ owner_id: studentId, title: sourceName, source_type: 'pdf', status: 'ready' })
        .select('id')
        .single();
      if (srcErr) throw srcErr;
      sourceId = source.id;
    }
    const { error: delErr } = await supabase.from('sections').delete().eq('source_id', sourceId);
    if (delErr) throw delErr;
    const rows = sections
      .slice(0, 60)
      .map((s, i) => {
        const estado = String(s?.estado || 'pendiente').toLowerCase();
        return {
          source_id: sourceId,
          name: String(s?.nombre || '').trim() || `Section ${i + 1}`,
          description: String(s?.descripcion || '').trim(),
          order_index: i,
          progress_percent: Math.max(0, Math.min(100, Number(s?.porcentaje || 0))),
          status: estado === 'completado' ? 'completed' : estado === 'en_progreso' ? 'in_progress' : 'pending',
        };
      });
    const { error: insErr } = await supabase.from('sections').insert(rows);
    if (insErr) throw insErr;
    return res.json({ ok: true, count: rows.length });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save sections.'));
  }
});

app.post('/api/library/quiz', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const modeRaw = String(req.body?.mode || 'quiz').trim().toLowerCase();
  const mode = modeRaw === 'exam' ? 'exam' : 'quiz';
  const difficulty = String(req.body?.difficulty || 'medium').trim().toLowerCase();
  const sourceName = String(req.body?.sourceName || '').trim();
  const result = req.body?.result;
  const questions = Array.isArray(result?.questions) ? result.questions : [];
  if (!studentId || !questions.length) return res.status(400).json({ error: 'Missing studentId/quiz questions.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const sourceId = await resolveSourceIdByName(studentId, sourceName);
    const safeDifficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const { data: quizData, error: quizErr } = await supabase
      .from('quizzes')
      .insert({
        owner_id: studentId,
        source_id: sourceId,
        mode,
        difficulty: safeDifficulty,
        question_count: Math.max(1, questions.length),
      })
      .select('id')
      .single();
    if (quizErr) throw quizErr;
    const questionRows = questions
      .slice(0, 100)
      .map((q) => {
        const options = Array.isArray(q?.choices) ? q.choices.map((c) => String(c)) : [];
        const correctIndex = Number(q?.correctIndex || 0);
        return {
          quiz_id: quizData.id,
          question: String(q?.prompt || '').trim(),
          options,
          correct_answer: options[correctIndex] || options[0] || '',
          explanation: '',
        };
      })
      .filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2);
    if (questionRows.length) {
      const { error: questionsErr } = await supabase.from('quiz_questions').insert(questionRows);
      if (questionsErr) throw questionsErr;
    }
    return res.json({ ok: true, quizId: quizData.id, count: questionRows.length });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save quiz.'));
  }
});

app.post('/api/library/presentation', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const title = String(req.body?.title || 'Presentation').trim();
  const sourceNames = Array.isArray(req.body?.sourceNames) ? req.body.sourceNames : [];
  const slides = Array.isArray(req.body?.slides) ? req.body.slides : [];
  const references = Array.isArray(req.body?.references) ? req.body.references : [];
  if (!studentId || !slides.length) return res.status(400).json({ error: 'Missing studentId/slides.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const { data: presData, error: presErr } = await supabase
      .from('presentations')
      .insert({ owner_id: studentId, title, prompt_text: '' })
      .select('id')
      .single();
    if (presErr) throw presErr;

    const slideRows = slides.slice(0, 60).map((s, idx) => ({
      presentation_id: presData.id,
      slide_index: idx,
      title: String(s?.title || `Slide ${idx + 1}`).trim(),
      bullets: Array.isArray(s?.bullets) ? s.bullets.map((b) => String(b)) : [],
      notes: String(s?.notes || '').trim(),
      image_suggestion: String(s?.imageSuggestion || '').trim(),
      graph_suggestion: String(s?.graphSuggestion || '').trim(),
    }));
    const refRows = references
      .slice(0, 100)
      .map((r) => ({
        presentation_id: presData.id,
        ref_text: String(r?.text || '').trim(),
        url: String(r?.url || '').trim(),
      }))
      .filter((r) => r.ref_text);
    if (slideRows.length) {
      const { error: slidesErr } = await supabase.from('presentation_slides').insert(slideRows);
      if (slidesErr) throw slidesErr;
    }
    if (refRows.length) {
      const { error: refsErr } = await supabase.from('presentation_references').insert(refRows);
      if (refsErr) throw refsErr;
    }

    for (const sourceName of sourceNames.slice(0, 10)) {
      const sourceId = await resolveSourceIdByName(studentId, sourceName);
      if (!sourceId) continue;
      const { error: linkErr } = await supabase
        .from('presentation_sources')
        .upsert({ presentation_id: presData.id, source_id: sourceId }, { onConflict: 'presentation_id,source_id' });
      if (linkErr) throw linkErr;
    }

    return res.json({ ok: true, presentationId: presData.id });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save presentation.'));
  }
});

app.post('/api/library/grade', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const score = Number(req.body?.score);
  const weight = Number(req.body?.weight);
  if (!studentId || !subject || Number.isNaN(score) || Number.isNaN(weight)) {
    return res.status(400).json({ error: 'Missing studentId/subject/score/weight.' });
  }
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const { data, error } = await supabase
      .from('grades')
      .insert({ owner_id: studentId, subject, score, weight })
      .select('id,subject,score,weight')
      .single();
    if (error) throw error;
    return res.json({ ok: true, grade: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save grade.'));
  }
});

app.post('/api/library/simulation', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const target = Number(req.body?.target);
  const reqFinal = Number(req.body?.requiredFinal);
  const finalWeight = Number(req.body?.finalWeight);
  if (!studentId || Number.isNaN(target) || Number.isNaN(reqFinal) || Number.isNaN(finalWeight)) {
    return res.status(400).json({ error: 'Missing studentId/target/requiredFinal/finalWeight.' });
  }
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const { data, error } = await supabase
      .from('grade_simulations')
      .insert({ owner_id: studentId, target, required_final: reqFinal, final_weight: finalWeight })
      .select('id,target,required_final')
      .single();
    if (error) throw error;
    return res.json({ ok: true, simulation: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save grade simulation.'));
  }
});

app.post('/api/library/academic-ai', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const outputTypeRaw = String(req.body?.outputType || '').trim().toLowerCase();
  const outputType = outputTypeRaw === 'estimate' ? 'estimate' : 'advice';
  const payload = req.body?.payload || {};
  if (!studentId) return res.status(400).json({ error: 'Missing studentId.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const { data, error } = await supabase
      .from('academic_ai_outputs')
      .insert({ owner_id: studentId, output_type: outputType, payload })
      .select('id')
      .single();
    if (error) throw error;
    return res.json({ ok: true, id: data.id });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save academic AI output.'));
  }
});

app.post('/api/library/chat-message', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const room = String(req.body?.room || 'global').trim().toLowerCase() || 'global';
  const content = String(req.body?.content || '').trim();
  if (!studentId || !content) return res.status(400).json({ error: 'Missing studentId/content.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const chatRoom = await getOrCreateOwnerChatRoom(studentId, room);
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: chatRoom.id, sender_id: studentId, content })
      .select('id,content,created_at')
      .single();
    if (error) throw error;
    return res.json({
      ok: true,
      message: {
        id: data.id,
        room: chatRoom.name,
        text: data.content,
        sender: 'You',
      },
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save chat message.'));
  }
});

app.post('/api/library/tutor-message', async (req, res) => {
  if (!requireSupabase(res)) return;
  const studentId = String(req.body?.studentId || '').trim();
  const prompt = String(req.body?.prompt || '').trim();
  const reply = String(req.body?.reply || '').trim();
  if (!studentId || !prompt || !reply) return res.status(400).json({ error: 'Missing studentId/prompt/reply.' });
  if (!isUuid(studentId)) return res.status(400).json({ error: 'studentId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(studentId);
    const conversationId = await getOrCreateTutorConversation(studentId);
    const { error: userErr } = await supabase
      .from('tutor_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: prompt, citations: [] });
    if (userErr) throw userErr;
    const { data, error: assistantErr } = await supabase
      .from('tutor_messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: reply, citations: [] })
      .select('id')
      .single();
    if (assistantErr) throw assistantErr;
    return res.json({ ok: true, id: data.id });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save tutor messages.'));
  }
});

app.get('/api/courses', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  if (!isUuid(userId)) return res.status(400).json({ error: 'userId must be a valid UUID.' });
  try {
    const [{ data: owned, error: ownedErr }, { data: enrolled, error: enrErr }] = await Promise.all([
      supabase
        .from('lms_courses')
        .select('id,title,code,description,published,created_at,owner_teacher_id')
        .eq('owner_teacher_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('lms_enrollments')
        .select('role,status,lms_courses!lms_enrollments_course_id_fkey(id,title,code,description,published,created_at,owner_teacher_id)')
        .eq('user_id', userId)
        .eq('status', 'active'),
    ]);
    if (ownedErr || enrErr) throw (ownedErr || enrErr);
    const byId = new Map();
    for (const c of owned || []) byId.set(c.id, { ...c, membershipRole: 'teacher' });
    for (const e of enrolled || []) {
      const course = Array.isArray(e.lms_courses) ? e.lms_courses[0] : e.lms_courses;
      if (!course?.id) continue;
      if (!byId.has(course.id)) byId.set(course.id, { ...course, membershipRole: e.role || 'student' });
    }
    const courses = [...byId.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load courses.'));
  }
});

app.post('/api/courses', async (req, res) => {
  if (!requireSupabase(res)) return;
  const ownerId = String(req.body?.ownerId || '').trim();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const termId = req.body?.termId ? String(req.body.termId).trim() : null;
  const published = !!req.body?.published;
  if (!ownerId || !title) return res.status(400).json({ error: 'Missing ownerId/title.' });
  if (!isUuid(ownerId) || (termId && !isUuid(termId))) return res.status(400).json({ error: 'ownerId/termId must be valid UUIDs.' });
  try {
    await ensureProfile(ownerId, 'Teacher');
    const code = `CRS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from('lms_courses')
      .insert({
        owner_teacher_id: ownerId,
        title,
        code,
        description,
        term_id: termId,
        published,
      })
      .select('id,title,code,description,published,created_at')
      .single();
    if (error) throw error;
    await supabase.from('lms_enrollments').upsert(
      {
        course_id: data.id,
        user_id: ownerId,
        role: 'teacher',
        status: 'active',
      },
      { onConflict: 'course_id,user_id' },
    );
    await logLmsAudit({ actorId: ownerId, action: 'course.create', entityType: 'lms_course', entityId: data.id, payload: { title } });
    return res.json({ ok: true, course: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not create course.'));
  }
});

app.get('/api/modules', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = String(req.query?.courseId || '').trim();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseMember(userId, courseId);
    const [{ data: modules, error: modErr }, { data: pages, error: pageErr }] = await Promise.all([
      supabase.from('lms_modules').select('id,title,description,position,published,created_at').eq('course_id', courseId).order('position', { ascending: true }),
      supabase.from('lms_pages').select('id,title,published,updated_at').eq('course_id', courseId).order('updated_at', { ascending: false }).limit(40),
    ]);
    if (modErr || pageErr) throw (modErr || pageErr);
    const moduleIds = (modules || []).map((m) => m.id);
    let items = [];
    if (moduleIds.length) {
      const { data: itemRows, error: itemsErr } = await supabase
        .from('lms_module_items')
        .select('id,module_id,item_type,ref_id,title,position,published,url')
        .in('module_id', moduleIds)
        .order('position', { ascending: true });
      if (itemsErr) throw itemsErr;
      items = itemRows || [];
    }
    const itemsByModule = new Map();
    for (const row of items || []) {
      if (!itemsByModule.has(row.module_id)) itemsByModule.set(row.module_id, []);
      itemsByModule.get(row.module_id).push(row);
    }
    return res.json({
      modules: (modules || []).map((m) => ({ ...m, items: itemsByModule.get(m.id) || [] })),
      pages: pages || [],
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load modules.'));
  }
});

app.post('/api/modules', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = String(req.body?.courseId || '').trim();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const position = Number(req.body?.position ?? 0);
  const published = !!req.body?.published;
  if (!userId || !courseId || !title) return res.status(400).json({ error: 'Missing userId/courseId/title.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseOwner(userId, courseId);
    const { data, error } = await supabase
      .from('lms_modules')
      .insert({
        course_id: courseId,
        title,
        description,
        position: Number.isFinite(position) ? position : 0,
        published,
        created_by: userId,
      })
      .select('id,title,description,position,published,created_at')
      .single();
    if (error) throw error;
    await logLmsAudit({ actorId: userId, action: 'module.create', entityType: 'lms_module', entityId: data.id, payload: { courseId, title } });
    return res.json({ ok: true, module: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not create module.'));
  }
});

app.get('/api/assignments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = String(req.query?.courseId || '').trim();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseMember(userId, courseId);
    const { data, error } = await supabase
      .from('lms_assignments')
      .select('id,title,description,due_at,points,status,created_at,created_by')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ assignments: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load assignments.'));
  }
});

app.post('/api/assignments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = String(req.body?.courseId || '').trim();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const dueAt = req.body?.dueAt || null;
  const points = Number(req.body?.points ?? 100);
  const status = String(req.body?.status || 'published').trim().toLowerCase();
  const safeStatus = ['draft', 'published', 'closed'].includes(status) ? status : 'published';
  if (!userId || !courseId || !title) return res.status(400).json({ error: 'Missing userId/courseId/title.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseOwner(userId, courseId);
    const { data, error } = await supabase
      .from('lms_assignments')
      .insert({
        course_id: courseId,
        title,
        description,
        due_at: dueAt,
        points: Number.isFinite(points) ? points : 100,
        status: safeStatus,
        created_by: userId,
      })
      .select('id,title,description,due_at,points,status,created_at')
      .single();
    if (error) throw error;
    try {
      const { data: enrolled } = await supabase
        .from('lms_enrollments')
        .select('user_id')
        .eq('course_id', courseId)
        .eq('status', 'active');
      const notices = (enrolled || [])
        .map((e) => e.user_id)
        .filter((uid) => uid && uid !== userId)
        .map((uid) => ({
          user_id: uid,
          kind: 'assignment',
          title: `New assignment: ${title}`,
          body: `A new assignment was posted in your course.`,
          meta: { courseId, assignmentId: data.id },
        }));
      if (notices.length) await supabase.from('lms_notifications').insert(notices);
    } catch {
      // non-blocking notifications
    }
    await logLmsAudit({ actorId: userId, action: 'assignment.create', entityType: 'lms_assignment', entityId: data.id, payload: { courseId, title } });
    return res.json({ ok: true, assignment: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not create assignment.'));
  }
});

app.get('/api/quizzes', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = String(req.query?.courseId || '').trim();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseMember(userId, courseId);
    const { data, error } = await supabase
      .from('lms_quizzes')
      .select('id,title,difficulty,question_count,payload,status,created_at,created_by')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ quizzes: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load quizzes.'));
  }
});

app.post('/api/quizzes', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = String(req.body?.courseId || '').trim();
  const title = String(req.body?.title || 'Course Quiz').trim();
  const difficultyRaw = String(req.body?.difficulty || 'medium').trim().toLowerCase();
  const difficulty = ['easy', 'medium', 'hard'].includes(difficultyRaw) ? difficultyRaw : 'medium';
  const questionCount = Math.max(1, Math.min(100, Number(req.body?.questionCount || 10)));
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  const statusRaw = String(req.body?.status || 'published').trim().toLowerCase();
  const status = ['draft', 'published', 'closed'].includes(statusRaw) ? statusRaw : 'published';
  const action = String(req.body?.action || 'create').trim().toLowerCase();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    const member = await ensureCourseMember(userId, courseId);
    if (action === 'attempt') {
      if (member.role !== 'student' && member.role !== 'observer') {
        return res.status(403).json({ error: 'Only students/observers can record attempts.' });
      }
      const quizId = String(req.body?.quizId || '').trim();
      const score = req.body?.score === undefined ? null : Number(req.body?.score);
      const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
      if (!quizId || !isUuid(quizId)) return res.status(400).json({ error: 'Missing valid quizId.' });
      const { data, error } = await supabase
        .from('lms_quiz_attempts')
        .insert({
          quiz_id: quizId,
          student_id: userId,
          score: Number.isFinite(score) ? score : null,
          answers,
          completed_at: new Date().toISOString(),
        })
        .select('id,quiz_id,student_id,score,answers,started_at,completed_at')
        .single();
      if (error) throw error;
      await logLmsAudit({ actorId: userId, action: 'quiz.attempt', entityType: 'lms_quiz_attempt', entityId: data.id, payload: { quizId, score } });
      return res.json({ ok: true, attempt: data });
    }
    if (member.role !== 'teacher' && member.role !== 'ta') {
      return res.status(403).json({ error: 'Only teacher/TA can create quizzes.' });
    }
    const { data, error } = await supabase
      .from('lms_quizzes')
      .insert({
        course_id: courseId,
        title,
        difficulty,
        question_count: questionCount,
        payload,
        status,
        created_by: userId,
      })
      .select('id,title,difficulty,question_count,payload,status,created_at,created_by')
      .single();
    if (error) throw error;
    await logLmsAudit({ actorId: userId, action: 'quiz.create', entityType: 'lms_quiz', entityId: data.id, payload: { courseId, title } });
    return res.json({ ok: true, quiz: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save quiz.'));
  }
});

app.get('/api/submissions', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const assignmentId = String(req.query?.assignmentId || '').trim();
  if (!userId || !assignmentId) return res.status(400).json({ error: 'Missing userId/assignmentId.' });
  if (!isUuid(userId) || !isUuid(assignmentId)) return res.status(400).json({ error: 'userId/assignmentId must be valid UUIDs.' });
  try {
    const { data: assignmentRows, error: assErr } = await supabase
      .from('lms_assignments')
      .select('id,course_id,created_by')
      .eq('id', assignmentId)
      .limit(1);
    if (assErr) throw assErr;
    const assignment = assignmentRows?.[0];
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    const membership = await ensureCourseMember(userId, assignment.course_id);
    let query = supabase
      .from('lms_submissions')
      .select('id,assignment_id,student_id,attempt_no,submission_text,file_url,submitted_at,status,grade,feedback,graded_by,graded_at,created_at')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false });
    if (membership.role === 'student' || membership.role === 'observer') {
      query = query.eq('student_id', userId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ submissions: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load submissions.'));
  }
});

app.post('/api/submissions', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const assignmentId = String(req.body?.assignmentId || '').trim();
  const submissionText = String(req.body?.submissionText || '').trim();
  const fileUrl = String(req.body?.fileUrl || '').trim();
  const grade = req.body?.grade === undefined ? null : Number(req.body?.grade);
  const feedback = String(req.body?.feedback || '').trim();
  if (!userId || !assignmentId) return res.status(400).json({ error: 'Missing userId/assignmentId.' });
  if (!isUuid(userId) || !isUuid(assignmentId)) return res.status(400).json({ error: 'userId/assignmentId must be valid UUIDs.' });
  try {
    const { data: assignmentRows, error: assErr } = await supabase
      .from('lms_assignments')
      .select('id,course_id,created_by')
      .eq('id', assignmentId)
      .limit(1);
    if (assErr) throw assErr;
    const assignment = assignmentRows?.[0];
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });
    const membership = await ensureCourseMember(userId, assignment.course_id);
    if (grade !== null && membership.role !== 'teacher' && membership.role !== 'ta') {
      return res.status(403).json({ error: 'Only teacher/TA can grade submissions.' });
    }
    if (grade !== null) {
      const targetSubmissionId = String(req.body?.submissionId || '').trim();
      if (!targetSubmissionId || !isUuid(targetSubmissionId)) return res.status(400).json({ error: 'Missing valid submissionId for grading.' });
      const { data, error } = await supabase
        .from('lms_submissions')
        .update({
          grade,
          feedback,
          status: 'graded',
          graded_by: userId,
          graded_at: new Date().toISOString(),
        })
        .eq('id', targetSubmissionId)
        .select('id,assignment_id,student_id,attempt_no,status,grade,feedback,graded_by,graded_at,created_at')
        .single();
      if (error) throw error;
      await logLmsAudit({ actorId: userId, action: 'submission.grade', entityType: 'lms_submission', entityId: data.id, payload: { grade } });
      return res.json({ ok: true, submission: data });
    }
    const { data: previousRows, error: prevErr } = await supabase
      .from('lms_submissions')
      .select('attempt_no')
      .eq('assignment_id', assignmentId)
      .eq('student_id', userId)
      .order('attempt_no', { ascending: false })
      .limit(1);
    if (prevErr) throw prevErr;
    const attemptNo = Number(previousRows?.[0]?.attempt_no || 0) + 1;
    const { data, error } = await supabase
      .from('lms_submissions')
      .insert({
        assignment_id: assignmentId,
        student_id: userId,
        attempt_no: attemptNo,
        submission_text: submissionText,
        file_url: fileUrl || null,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      })
      .select('id,assignment_id,student_id,attempt_no,submission_text,file_url,submitted_at,status,created_at')
      .single();
    if (error) throw error;
    try {
      const { data: courseRows } = await supabase
        .from('lms_assignments')
        .select('course_id,lms_courses!lms_assignments_course_id_fkey(owner_teacher_id)')
        .eq('id', assignmentId)
        .limit(1);
      const course = courseRows?.[0];
      const owner = Array.isArray(course?.lms_courses) ? course.lms_courses[0]?.owner_teacher_id : course?.lms_courses?.owner_teacher_id;
      if (owner) {
        await supabase.from('lms_notifications').insert({
          user_id: owner,
          kind: 'submission',
          title: 'New student submission',
          body: 'A student submitted an assignment.',
          meta: { assignmentId, submissionId: data.id },
        });
      }
    } catch {
      // non-blocking notifications
    }
    await logLmsAudit({ actorId: userId, action: 'submission.create', entityType: 'lms_submission', entityId: data.id, payload: { assignmentId, attemptNo } });
    return res.json({ ok: true, submission: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save submission.'));
  }
});

app.get('/api/discussions', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = String(req.query?.courseId || '').trim();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'userId/courseId must be valid UUIDs.' });
  try {
    await ensureCourseMember(userId, courseId);
    const { data: discussions, error: dErr } = await supabase
      .from('lms_discussions')
      .select('id,title,body,created_by,locked,created_at')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    if (dErr) throw dErr;
    const discussionIds = (discussions || []).map((d) => d.id);
    let replies = [];
    if (discussionIds.length) {
      const { data: repRows, error: repErr } = await supabase
        .from('lms_discussion_replies')
        .select('id,discussion_id,parent_reply_id,author_id,body,created_at')
        .in('discussion_id', discussionIds)
        .order('created_at', { ascending: true });
      if (repErr) throw repErr;
      replies = repRows || [];
    }
    const grouped = new Map();
    for (const r of replies) {
      if (!grouped.has(r.discussion_id)) grouped.set(r.discussion_id, []);
      grouped.get(r.discussion_id).push(r);
    }
    return res.json({
      discussions: (discussions || []).map((d) => ({ ...d, replies: grouped.get(d.id) || [] })),
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load discussions.'));
  }
});

app.post('/api/discussions', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = String(req.body?.courseId || '').trim();
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const discussionId = req.body?.discussionId ? String(req.body.discussionId).trim() : '';
  const parentReplyId = req.body?.parentReplyId ? String(req.body.parentReplyId).trim() : null;
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId) || (discussionId && !isUuid(discussionId)) || (parentReplyId && !isUuid(parentReplyId))) {
    return res.status(400).json({ error: 'Invalid UUID payload.' });
  }
  try {
    await ensureCourseMember(userId, courseId);
    if (discussionId) {
      const { data, error } = await supabase
        .from('lms_discussion_replies')
        .insert({
          discussion_id: discussionId,
          parent_reply_id: parentReplyId,
          author_id: userId,
          body,
        })
        .select('id,discussion_id,parent_reply_id,author_id,body,created_at')
        .single();
      if (error) throw error;
      await logLmsAudit({ actorId: userId, action: 'discussion.reply', entityType: 'lms_discussion_reply', entityId: data.id, payload: { discussionId } });
      return res.json({ ok: true, reply: data });
    }
    if (!title) return res.status(400).json({ error: 'Missing title for new discussion.' });
    const { data, error } = await supabase
      .from('lms_discussions')
      .insert({
        course_id: courseId,
        title,
        body,
        created_by: userId,
      })
      .select('id,title,body,created_by,locked,created_at')
      .single();
    if (error) throw error;
    await logLmsAudit({ actorId: userId, action: 'discussion.create', entityType: 'lms_discussion', entityId: data.id, payload: { courseId, title } });
    return res.json({ ok: true, discussion: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save discussion data.'));
  }
});

app.get('/api/messages', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const threadId = req.query?.threadId ? String(req.query.threadId).trim() : '';
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  if (!isUuid(userId) || (threadId && !isUuid(threadId))) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    const { data: participantRows, error: pErr } = await supabase
      .from('lms_inbox_participants')
      .select('thread_id')
      .eq('user_id', userId);
    if (pErr) throw pErr;
    const threadIds = (participantRows || []).map((r) => r.thread_id);
    if (!threadIds.length) return res.json({ threads: [], messages: [] });
    const [{ data: threads, error: tErr }, { data: messages, error: mErr }] = await Promise.all([
      supabase
        .from('lms_inbox_threads')
        .select('id,course_id,subject,created_by,created_at,updated_at')
        .in('id', threadId ? [threadId] : threadIds)
        .order('updated_at', { ascending: false }),
      supabase
        .from('lms_inbox_messages')
        .select('id,thread_id,sender_id,body,created_at')
        .in('thread_id', threadId ? [threadId] : threadIds)
        .order('created_at', { ascending: true }),
    ]);
    if (tErr || mErr) throw (tErr || mErr);
    return res.json({ threads: threads || [], messages: messages || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load messages.'));
  }
});

app.post('/api/messages', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const threadId = req.body?.threadId ? String(req.body.threadId).trim() : '';
  const courseId = req.body?.courseId ? String(req.body.courseId).trim() : null;
  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();
  const recipientIds = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!userId || !body) return res.status(400).json({ error: 'Missing userId/body.' });
  if (!isUuid(userId) || (threadId && !isUuid(threadId)) || (courseId && !isUuid(courseId)) || recipientIds.some((id) => !isUuid(id))) {
    return res.status(400).json({ error: 'Invalid UUID payload.' });
  }
  try {
    let effectiveThreadId = threadId;
    if (!effectiveThreadId) {
      const { data: thread, error: threadErr } = await supabase
        .from('lms_inbox_threads')
        .insert({
          course_id: courseId,
          subject: subject || 'Course message',
          created_by: userId,
        })
        .select('id')
        .single();
      if (threadErr) throw threadErr;
      effectiveThreadId = thread.id;
      const participantRows = [{ thread_id: effectiveThreadId, user_id: userId }, ...recipientIds.map((rid) => ({ thread_id: effectiveThreadId, user_id: rid }))];
      const { error: partErr } = await supabase.from('lms_inbox_participants').upsert(participantRows, { onConflict: 'thread_id,user_id' });
      if (partErr) throw partErr;
    }
    const { data, error } = await supabase
      .from('lms_inbox_messages')
      .insert({ thread_id: effectiveThreadId, sender_id: userId, body })
      .select('id,thread_id,sender_id,body,created_at')
      .single();
    if (error) throw error;
    await supabase.from('lms_inbox_threads').update({ updated_at: new Date().toISOString() }).eq('id', effectiveThreadId);
    try {
      const { data: recipients } = await supabase
        .from('lms_inbox_participants')
        .select('user_id')
        .eq('thread_id', effectiveThreadId);
      const notices = (recipients || [])
        .map((r) => r.user_id)
        .filter((uid) => uid && uid !== userId)
        .map((uid) => ({
          user_id: uid,
          kind: 'message',
          title: 'New inbox message',
          body: 'You have a new message in LMS inbox.',
          meta: { threadId: effectiveThreadId, messageId: data.id },
        }));
      if (notices.length) await supabase.from('lms_notifications').insert(notices);
    } catch {
      // non-blocking notifications
    }
    await logLmsAudit({ actorId: userId, action: 'message.send', entityType: 'lms_inbox_message', entityId: data.id, payload: { threadId: effectiveThreadId } });
    return res.json({ ok: true, message: data, threadId: effectiveThreadId });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not send message.'));
  }
});

app.get('/api/calendar', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = req.query?.courseId ? String(req.query.courseId).trim() : null;
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  if (!isUuid(userId) || (courseId && !isUuid(courseId))) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    let query = supabase
      .from('lms_calendar_events')
      .select('id,owner_id,course_id,title,description,event_type,start_at,end_at,created_at')
      .eq('owner_id', userId)
      .order('start_at', { ascending: true });
    if (courseId) query = query.eq('course_id', courseId);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ events: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load calendar events.'));
  }
});

app.post('/api/calendar', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = req.body?.courseId ? String(req.body.courseId).trim() : null;
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const eventType = String(req.body?.eventType || 'event').trim().toLowerCase();
  const startAt = req.body?.startAt;
  const endAt = req.body?.endAt || null;
  const safeType = ['event', 'deadline', 'meeting', 'reminder'].includes(eventType) ? eventType : 'event';
  if (!userId || !title || !startAt) return res.status(400).json({ error: 'Missing userId/title/startAt.' });
  if (!isUuid(userId) || (courseId && !isUuid(courseId))) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    const { data, error } = await supabase
      .from('lms_calendar_events')
      .insert({
        owner_id: userId,
        course_id: courseId,
        title,
        description,
        event_type: safeType,
        start_at: startAt,
        end_at: endAt,
      })
      .select('id,owner_id,course_id,title,description,event_type,start_at,end_at,created_at')
      .single();
    if (error) throw error;
    await logLmsAudit({ actorId: userId, action: 'calendar.create', entityType: 'lms_calendar_event', entityId: data.id, payload: { title, eventType: safeType } });
    return res.json({ ok: true, event: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save calendar event.'));
  }
});

app.get('/api/notifications', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  if (!isUuid(userId)) return res.status(400).json({ error: 'userId must be valid UUID.' });
  try {
    const { data, error } = await supabase
      .from('lms_notifications')
      .select('id,kind,title,body,meta,read_at,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return res.json({ notifications: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load notifications.'));
  }
});

app.post('/api/notifications', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const kind = String(req.body?.kind || 'info').trim();
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
  const read = !!req.body?.read;
  if (!userId || !title) return res.status(400).json({ error: 'Missing userId/title.' });
  if (!isUuid(userId)) return res.status(400).json({ error: 'userId must be valid UUID.' });
  try {
    const { data, error } = await supabase
      .from('lms_notifications')
      .insert({
        user_id: userId,
        kind,
        title,
        body,
        meta,
        read_at: read ? new Date().toISOString() : null,
      })
      .select('id,kind,title,body,meta,read_at,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, notification: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save notification.'));
  }
});

app.get('/api/analytics', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = req.query?.courseId ? String(req.query.courseId).trim() : '';
  if (!userId) return res.status(400).json({ error: 'Missing userId.' });
  if (!isUuid(userId) || (courseId && !isUuid(courseId))) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    const limit = Math.max(10, Math.min(500, Number(req.query?.limit || 200)));
    let eventsQuery = supabase
      .from('lms_analytics_events')
      .select('id,user_id,course_id,event_name,payload,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (courseId) {
      await ensureCourseMember(userId, courseId);
      eventsQuery = eventsQuery.eq('course_id', courseId);
    } else {
      eventsQuery = eventsQuery.eq('user_id', userId);
    }
    const { data: events, error } = await eventsQuery;
    if (error) throw error;
    const aggregates = {};
    for (const e of events || []) {
      aggregates[e.event_name] = (aggregates[e.event_name] || 0) + 1;
    }
    return res.json({ events: events || [], aggregates });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load analytics.'));
  }
});

app.post('/api/analytics', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.body?.userId || '').trim();
  const courseId = req.body?.courseId ? String(req.body.courseId).trim() : null;
  const eventName = String(req.body?.eventName || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  if (!userId || !eventName) return res.status(400).json({ error: 'Missing userId/eventName.' });
  if (!isUuid(userId) || (courseId && !isUuid(courseId))) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    if (courseId) await ensureCourseMember(userId, courseId);
    const { data, error } = await supabase
      .from('lms_analytics_events')
      .insert({
        user_id: userId,
        course_id: courseId,
        event_name: eventName,
        payload,
      })
      .select('id,user_id,course_id,event_name,payload,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, event: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save analytics event.'));
  }
});

app.get('/api/grades', async (req, res) => {
  if (!requireSupabase(res)) return;
  const userId = String(req.query?.userId || '').trim();
  const courseId = String(req.query?.courseId || '').trim();
  if (!userId || !courseId) return res.status(400).json({ error: 'Missing userId/courseId.' });
  if (!isUuid(userId) || !isUuid(courseId)) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    const member = await ensureCourseMember(userId, courseId);
    const { data: assignments, error: assErr } = await supabase
      .from('lms_assignments')
      .select('id,title,points,due_at')
      .eq('course_id', courseId);
    if (assErr) throw assErr;
    const assignmentIds = (assignments || []).map((a) => a.id);
    let submissions = [];
    if (assignmentIds.length) {
      let q = supabase
        .from('lms_submissions')
        .select('id,assignment_id,student_id,attempt_no,grade,status,feedback,graded_at,submitted_at')
        .in('assignment_id', assignmentIds);
      if (member.role === 'student' || member.role === 'observer') q = q.eq('student_id', userId);
      const { data: subRows, error: subErr } = await q;
      if (subErr) throw subErr;
      submissions = subRows || [];
    }
    return res.json({ assignments: assignments || [], submissions });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load grades.'));
  }
});

app.post('/api/grades', async (req, res) => {
  if (!requireSupabase(res)) return;
  const graderId = String(req.body?.graderId || '').trim();
  const submissionId = String(req.body?.submissionId || '').trim();
  const grade = Number(req.body?.grade);
  const feedback = String(req.body?.feedback || '').trim();
  if (!graderId || !submissionId || Number.isNaN(grade)) return res.status(400).json({ error: 'Missing graderId/submissionId/grade.' });
  if (!isUuid(graderId) || !isUuid(submissionId)) return res.status(400).json({ error: 'Invalid UUID payload.' });
  try {
    const { data: subRows, error: subErr } = await supabase
      .from('lms_submissions')
      .select('id,assignment_id')
      .eq('id', submissionId)
      .limit(1);
    if (subErr) throw subErr;
    const submission = subRows?.[0];
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    const { data: assRows, error: assErr } = await supabase
      .from('lms_assignments')
      .select('course_id')
      .eq('id', submission.assignment_id)
      .limit(1);
    if (assErr) throw assErr;
    const courseId = assRows?.[0]?.course_id;
    if (!courseId) return res.status(404).json({ error: 'Assignment not found.' });
    const member = await ensureCourseMember(graderId, courseId);
    if (member.role !== 'teacher' && member.role !== 'ta') return res.status(403).json({ error: 'Only teacher/TA can grade.' });
    const { data, error } = await supabase
      .from('lms_submissions')
      .update({
        grade,
        feedback,
        status: 'graded',
        graded_by: graderId,
        graded_at: new Date().toISOString(),
      })
      .eq('id', submissionId)
      .select('id,assignment_id,student_id,attempt_no,grade,status,feedback,graded_by,graded_at')
      .single();
    if (error) throw error;
    try {
      await supabase.from('lms_notifications').insert({
        user_id: data.student_id,
        kind: 'grade',
        title: 'New grade posted',
        body: 'A submission grade has been updated.',
        meta: { submissionId, grade },
      });
    } catch {
      // non-blocking notifications
    }
    await logLmsAudit({ actorId: graderId, action: 'grade.update', entityType: 'lms_submission', entityId: data.id, payload: { grade } });
    return res.json({ ok: true, submission: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save grade.'));
  }
});

app.get('/api/teacher/dashboard', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId.' });
  if (!isUuid(teacherId)) return res.status(400).json({ error: 'teacherId must be a valid Supabase auth user UUID.' });
  try {
    const [{ count: classCount, error: classesErr }, { count: assignmentCount, error: assErr }, { count: announcementCount, error: annErr }] = await Promise.all([
      supabase.from('teacher_classes').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
      supabase.from('teacher_assignments').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
      supabase.from('teacher_announcements').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
    ]);
    if (classesErr || assErr || annErr) throw (classesErr || assErr || annErr);

    const { data: classes, error: classErr } = await supabase
      .from('teacher_classes')
      .select('id,name')
      .eq('teacher_id', teacherId);
    if (classErr) throw classErr;
    const classIds = (classes || []).map((c) => c.id);

    let submissionCount = 0;
    if (classIds.length) {
      const { data: teacherAssignments, error: taErr } = await supabase
        .from('teacher_assignments')
        .select('id')
        .in('class_id', classIds);
      if (taErr) throw taErr;
      const assignmentIds = (teacherAssignments || []).map((a) => a.id).filter(Boolean);
      if (assignmentIds.length) {
        const { count, error } = await supabase
          .from('assignment_submissions')
          .select('*', { count: 'exact', head: true })
          .in('assignment_id', assignmentIds);
        if (error) throw error;
        submissionCount = count || 0;
      }
    }

    return res.json({
      stats: {
        classes: classCount || 0,
        assignments: assignmentCount || 0,
        announcements: announcementCount || 0,
        submissions: submissionCount || 0,
      },
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load teacher dashboard.'));
  }
});

app.get('/api/teacher/classes', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId.' });
  if (!isUuid(teacherId)) return res.status(400).json({ error: 'teacherId must be a valid Supabase auth user UUID.' });
  try {
    const { data, error } = await supabase
      .from('teacher_classes')
      .select('id,name,code,description,created_at')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ classes: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load classes.'));
  }
});

app.post('/api/teacher/classes', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!teacherId || !name) return res.status(400).json({ error: 'Missing teacherId/name.' });
  if (!isUuid(teacherId)) return res.status(400).json({ error: 'teacherId must be a valid Supabase auth user UUID.' });
  try {
    await ensureProfile(teacherId);
    const code = `CLS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from('teacher_classes')
      .insert({ teacher_id: teacherId, name, description, code })
      .select('id,name,code,description,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, class: data });
  } catch (error) {
    console.error('[teacher/classes] create failed', {
      teacherId,
      name,
      code: error?.code || null,
      message: error?.message || String(error),
      details: error?.details || null,
      hint: error?.hint || null,
    });
    return res.status(500).json(formatSupabaseError(error, 'Could not create class.'));
  }
});

app.get('/api/teacher/enrollments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId || !classId) return res.status(400).json({ error: 'Missing teacherId/classId.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('class_enrollments')
      .select('student_id,status,created_at,profiles!class_enrollments_student_id_fkey(id,display_name)')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({
      enrollments: (data || []).map((r) => ({
        studentId: r.student_id,
        status: r.status,
        createdAt: r.created_at,
        name: Array.isArray(r.profiles) ? r.profiles[0]?.display_name : r.profiles?.display_name || 'Student',
      })),
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load enrollments.'));
  }
});

app.post('/api/teacher/enrollments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const studentName = String(req.body?.studentName || 'Student').trim();
  const status = String(req.body?.status || 'active').trim().toLowerCase();
  const safeStatus = ['active', 'invited', 'removed'].includes(status) ? status : 'active';
  if (!teacherId || !classId || !studentId) return res.status(400).json({ error: 'Missing teacherId/classId/studentId.' });
  if (!isUuid(teacherId) || !isUuid(classId) || !isUuid(studentId)) {
    return res.status(400).json({ error: 'teacherId/classId/studentId must be valid UUIDs.' });
  }
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    await ensureProfile(studentId, studentName);
    const { data, error } = await supabase
      .from('class_enrollments')
      .upsert(
        {
          class_id: classId,
          student_id: studentId,
          status: safeStatus,
        },
        { onConflict: 'class_id,student_id' },
      )
      .select('class_id,student_id,status,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, enrollment: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save enrollment.'));
  }
});

app.get('/api/teacher/materials', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId || !classId) return res.status(400).json({ error: 'Missing teacherId/classId.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('class_materials')
      .select('id,title,material_type,content,created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ materials: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load class materials.'));
  }
});

app.post('/api/teacher/materials', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const title = String(req.body?.title || '').trim();
  const content = String(req.body?.content || '').trim();
  const materialType = String(req.body?.materialType || 'pdf').trim();
  if (!teacherId || !classId || !title) return res.status(400).json({ error: 'Missing teacherId/classId/title.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureProfile(teacherId);
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('class_materials')
      .insert({
        class_id: classId,
        title,
        material_type: materialType,
        content,
        created_by: teacherId,
      })
      .select('id,title,material_type,content,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, material: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save class material.'));
  }
});

app.get('/api/teacher/assignments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId.' });
  if (!isUuid(teacherId)) return res.status(400).json({ error: 'teacherId must be a valid UUID.' });
  try {
    let query = supabase
      .from('teacher_assignments')
      .select('id,class_id,title,description,due_at,status,created_at')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ assignments: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load assignments.'));
  }
});

app.post('/api/teacher/assignments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const dueAt = req.body?.dueAt || null;
  if (!teacherId || !classId || !title) return res.status(400).json({ error: 'Missing teacherId/classId/title.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureProfile(teacherId);
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('teacher_assignments')
      .insert({ teacher_id: teacherId, class_id: classId, title, description, due_at: dueAt, status: 'published' })
      .select('id,class_id,title,description,due_at,status,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, assignment: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not create assignment.'));
  }
});

app.get('/api/teacher/announcements', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId.' });
  if (!isUuid(teacherId)) return res.status(400).json({ error: 'teacherId must be a valid UUID.' });
  try {
    let query = supabase
      .from('teacher_announcements')
      .select('id,class_id,title,message,created_at')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ announcements: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load announcements.'));
  }
});

app.post('/api/teacher/announcements', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!teacherId || !classId || !title || !message) return res.status(400).json({ error: 'Missing teacherId/classId/title/message.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureProfile(teacherId);
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('teacher_announcements')
      .insert({ teacher_id: teacherId, class_id: classId, title, message })
      .select('id,class_id,title,message,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, announcement: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not publish announcement.'));
  }
});

app.post('/api/teacher/grading', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const assignmentId = req.body?.assignmentId ? String(req.body.assignmentId).trim() : null;
  const score = Number(req.body?.score);
  const feedback = String(req.body?.feedback || '').trim();
  if (!teacherId || !classId || !studentId || Number.isNaN(score)) {
    return res.status(400).json({ error: 'Missing teacherId/classId/studentId/score.' });
  }
  if (!isUuid(teacherId) || !isUuid(classId) || !isUuid(studentId) || (assignmentId && !isUuid(assignmentId))) {
    return res.status(400).json({ error: 'teacherId/classId/studentId/assignmentId must be valid UUIDs.' });
  }
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('teacher_grades')
      .insert({
        class_id: classId,
        teacher_id: teacherId,
        student_id: studentId,
        assignment_id: assignmentId,
        score,
        feedback,
      })
      .select('id,class_id,student_id,assignment_id,score,feedback,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, grade: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not save grade.'));
  }
});

app.get('/api/teacher/progress', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId || !classId) return res.status(400).json({ error: 'Missing teacherId/classId.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const [
      { count: enrolled, error: enrErr },
      { data: enrollmentRows, error: enrRowsErr },
      { data: gradeRows, error: gradeErr },
      { count: assignmentCount, error: assErr },
    ] = await Promise.all([
      supabase.from('class_enrollments').select('*', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'active'),
      supabase
        .from('class_enrollments')
        .select('student_id,status,profiles!class_enrollments_student_id_fkey(id,display_name)')
        .eq('class_id', classId),
      supabase.from('teacher_grades').select('student_id,score').eq('class_id', classId),
      supabase.from('teacher_assignments').select('*', { count: 'exact', head: true }).eq('class_id', classId),
    ]);
    if (enrErr || enrRowsErr || gradeErr || assErr) throw (enrErr || enrRowsErr || gradeErr || assErr);
    const avgScore = (gradeRows && gradeRows.length)
      ? gradeRows.reduce((sum, r) => sum + Number(r.score || 0), 0) / gradeRows.length
      : 0;
    return res.json({
      progress: {
        enrolled: enrolled || 0,
        assignments: assignmentCount || 0,
        gradedEntries: gradeRows?.length || 0,
        averageScore: Number(avgScore.toFixed(2)),
        students: (enrollmentRows || []).map((r) => ({
          studentId: r.student_id,
          status: r.status,
          name: Array.isArray(r.profiles) ? r.profiles[0]?.display_name : r.profiles?.display_name || 'Student',
        })),
      },
    });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load class progress.'));
  }
});

app.post('/api/teacher/quiz-generate', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.body?.teacherId || '').trim();
  const classId = String(req.body?.classId || '').trim();
  const title = String(req.body?.title || 'Class Quiz').trim();
  const difficulty = String(req.body?.difficulty || 'medium').trim();
  const count = Math.max(3, Math.min(30, Number(req.body?.count || 10)));
  const promptText = String(req.body?.promptText || '').trim();
  if (!teacherId || !classId) return res.status(400).json({ error: 'Missing teacherId/classId.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data: materials, error: matErr } = await supabase
      .from('class_materials')
      .select('title,content')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (matErr) throw matErr;
    const mergedText = (materials || [])
      .map((m) => `${m.title}\n${String(m.content || '').slice(0, 3000)}`)
      .join('\n\n')
      .slice(0, 16000);
    const teacherPassages = buildPassagesFromSources([{ name: title, content: `${promptText}\n\n${mergedText}` }]).slice(0, 25);
    const quizPrompt = `
Generate a quiz with exactly ${count} multiple-choice questions at ${difficulty} difficulty from SOURCE_PASSAGES.
Return strict JSON:
{
  "topic":"${title.replace(/"/g, '\\"')}",
  "total":${count},
  "estimatedCorrect":0,
  "sec":120,
  "questions":[
    {"prompt":"...","choices":["A","B","C","D"],"correctIndex":0}
  ]
}
Each question: exactly 4 choices, correctIndex 0-3.
SOURCE_PASSAGES:
${JSON.stringify(teacherPassages)}
`;
    let result;
    try {
      const modelData = await callOllama(quizPrompt);
      const parsed = safeParseModelJson(String(modelData.response || '').trim());
      result = normalizeQuizResult(parsed, { mode: 'quiz', count, difficulty, passages: teacherPassages });
    } catch {
      result = buildQuizFallback({ mode: 'quiz', count, difficulty, passages: teacherPassages });
    }

    const { data, error } = await supabase
      .from('teacher_generated_quizzes')
      .insert({
        class_id: classId,
        teacher_id: teacherId,
        title,
        difficulty,
        question_count: count,
        payload: result,
      })
      .select('id,class_id,title,difficulty,question_count,payload,created_at')
      .single();
    if (error) throw error;
    return res.json({ ok: true, quiz: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not generate teacher quiz.'));
  }
});

app.get('/api/teacher/quizzes', async (req, res) => {
  if (!requireSupabase(res)) return;
  const teacherId = String(req.query?.teacherId || '').trim();
  const classId = String(req.query?.classId || '').trim();
  if (!teacherId || !classId) return res.status(400).json({ error: 'Missing teacherId/classId.' });
  if (!isUuid(teacherId) || !isUuid(classId)) return res.status(400).json({ error: 'teacherId/classId must be valid UUIDs.' });
  try {
    await ensureTeacherOwnsClass(teacherId, classId);
    const { data, error } = await supabase
      .from('teacher_generated_quizzes')
      .select('id,title,difficulty,question_count,created_at,payload')
      .eq('class_id', classId)
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ quizzes: data || [] });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not load teacher quizzes.'));
  }
});

app.post('/api/ai-job', async (req, res) => {
  if (!requireSupabase(res)) return;
  const jobType = String(req.body?.jobType || '').trim();
  const userId = String(req.body?.userId || '').trim();
  const sessionId = String(req.body?.sessionId || '').trim();
  if (!jobType || !userId || !sessionId) {
    return res.status(400).json({ error: 'Missing jobType/userId/sessionId.' });
  }
  try {
    const { data, error } = await supabase.functions.invoke('ai-jobs', {
      body: { jobType, userId, sessionId, payload: req.body?.payload || {} },
    });
    if (error) throw error;
    return res.json({ ok: true, result: data });
  } catch (error) {
    return res.status(500).json(formatSupabaseError(error, 'Could not schedule AI edge job.'));
  }
});

app.post('/api/flashcards', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Missing text.' });
  }

  const sourceJson = buildSourceJson(text);
  const prompt = `
You are a study assistant.
Input is structured JSON extracted from a university document.
Generate 10 accurate and varied flashcards using ONLY input data.

Rules:
- Use only SOURCE_JSON facts/sentences.
- Questions must be diverse: definition, why, how, comparison, application.
- Answers concise (1-3 sentences).
- evidence must copy exact short phrase from SOURCE_JSON.sentences or SOURCE_JSON.facts.
- Avoid duplicate questions and generic wording.
- Return valid JSON only:
{"cards":[{"question":"...","answer":"...","evidence":"..."}]}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let cards = await generateCardsWithOllama(prompt);
    if (cards.length < 5) {
      // Recovery prompt: guarantee cards from explicit facts list.
      const fallbackPrompt = `
Return 8 flashcards from SOURCE_JSON.facts only.
Output strict JSON: {"cards":[{"question":"...","answer":"...","evidence":"..."}]}
SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;
      cards = await generateCardsWithOllama(fallbackPrompt);
    }

    return res.json({ cards });
  } catch (error) {
    return res.status(500).json({ error: 'Could not generate cards.', details: String(error) });
  }
});

app.post('/api/presentation', async (req, res) => {
  const topic = String(req.body?.topic || '').trim();
  const promptText = String(req.body?.promptText || req.body?.guide || '').trim();
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  const sourceText = String(req.body?.sourceText || '').trim();
  const requestedSlides = Math.max(4, Math.min(16, Number(req.body?.slides || 8)));

  if (!topic) {
    return res.status(400).json({ error: 'Missing topic.' });
  }

  const selectedSources = sources
    .map((s) => ({
      name: String(s?.name || 'uploaded.pdf').trim(),
      content: String(s?.content || '').trim().slice(0, 12000),
    }))
    .filter((s) => s.content);
  const mergedSourceText = sourceText || selectedSources.map((s) => `${s.name}\n${s.content}`).join('\n\n');
  const sourceJson = buildSourceJson(mergedSourceText || `${topic}. ${promptText}`);
  const sourceList = selectedSources.map((s) => s.name);
  const prompt = `
You are a university presentation assistant.
Create a concise, accurate slide deck in strict JSON only.

Rules:
- Use topic + PROMPT as priorities.
- Use SOURCE_JSON facts/sentences when possible.
- Add image suggestions and graph/chart suggestions when useful.
- Keep each slide 3-5 bullets.
- Keep bullets short and concrete.
- Add short speaker notes (1-2 sentences).
- Add references and Google Scholar links when available.
- Ensure slide titles are unique and avoid repeated bullets.
- Return JSON only with this exact shape:
{
  "title":"...",
  "references":[
    {"text":"...", "url":"https://scholar.google.com/scholar?q=..."}
  ],
  "slides":[
    {
      "title":"...",
      "bullets":["..."],
      "notes":"...",
      "imageSuggestion":"...",
      "graphSuggestion":"..."
    }
  ]
}
- Generate exactly ${requestedSlides} slides.

TOPIC:
${topic}

PROMPT:
${promptText || 'No extra prompt provided.'}

UPLOADED_SOURCES:
${JSON.stringify(sourceList)}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let presentation = await generatePresentationWithOllama(prompt);
    if (presentation.slides.length < Math.max(3, requestedSlides - 2)) {
      const fallbackPrompt = `
Return strict JSON only:
{
  "title":"${topic}",
  "references":[
    {"text":"Primary source from uploaded material","url":"https://scholar.google.com/scholar?q=${encodeURIComponent(topic)}"}
  ],
  "slides":[
    {"title":"Slide 1", "bullets":["...","...","..."], "notes":"...", "imageSuggestion":"...", "graphSuggestion":"..."}
  ]
}
Create exactly ${requestedSlides} slides.
`;
      presentation = await generatePresentationWithOllama(fallbackPrompt);
    }
    return res.json(presentation);
  } catch (error) {
    return res.status(500).json({ error: 'Could not generate presentation.', details: String(error) });
  }
});

app.post('/api/sections', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const title = String(req.body?.title || 'Document').trim();
  if (!text) {
    return res.status(400).json({ error: 'Missing text.' });
  }

  const sourceJson = buildSourceJson(text);
  const prompt = `
You are an academic document analyst.
Extract only the main sections/topics from the provided source.

Rules:
- Return 4 to 12 main sections.
- Keep names concise (3-8 words).
- Do not include subsections.
- Use source facts only.
- Return valid JSON only:
{
  "apartados":[
    {"id":"a1","nombre":"...","descripcion":"..."}
  ]
}

DOCUMENT_TITLE:
${title}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let apartados = await generateSectionsWithOllama(prompt);
    if (apartados.length < 3) {
      const fallbackPrompt = `
Return strict JSON only:
{
  "apartados":[
    {"id":"a1","nombre":"Main concept","descripcion":"Brief description from source."}
  ]
}
Generate between 4 and 8 items.
SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;
      apartados = await generateSectionsWithOllama(fallbackPrompt);
    }
    if (apartados.length < 3) {
      apartados = buildLocalApartadosFallback(sourceJson);
    }
    return res.json({ apartados });
  } catch (error) {
    return res.status(500).json({ error: 'Could not extract sections.', details: String(error) });
  }
});

app.post('/api/concept-map', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const title = String(req.body?.title || 'Concept Map').trim();
  if (!text) {
    return res.status(400).json({ error: 'Missing text.' });
  }

  const sourceJson = buildSourceJson(text);
  const prompt = `
You are an academic concept-map generator.
Create a HIERARCHICAL concept map from university study material (go deeper than a flat list).

Rules:
- Return 8 to 20 nodes.
- Each node has "level": 0 (central theme), 1 (major subtopics), 2 (details/examples), 3 (optional fine points).
- Keep labels concise (max 6 words). descriptions: one short sentence.
- Links connect parent concepts to children; cross-links allowed with clear labels.
- Return strict JSON only:
{
  "title":"...",
  "nodes":[
    {"id":"n0","label":"...","description":"...","level":0}
  ],
  "links":[
    {"source":"n0","target":"n1","label":"includes"}
  ]
}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let conceptMap = await generateConceptMapWithOllama(prompt);
    if (conceptMap.nodes.length < 6 || conceptMap.links.length < 4) {
      conceptMap = buildLocalConceptMapFallback(title, sourceJson);
    }
    return res.json(conceptMap);
  } catch {
    return res.json(buildLocalConceptMapFallback(title, sourceJson));
  }
});

app.post('/api/source-chat', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!question) return res.status(400).json({ error: 'Missing question.' });
  if (!sources.length) return res.status(400).json({ error: 'Missing sources.' });

  const passages = buildPassagesFromSources(sources);
  const ranked = rankPassages(question, passages).slice(0, 6);
  const prompt = `
You are a source-grounded academic assistant.
Answer only using the provided PASSAGES.
If information is missing, say so clearly.

Return strict JSON:
{
  "answer":"...",
  "citations":[
    {"source":"...","excerpt":"...","page":null}
  ]
}

QUESTION:
${question}

PASSAGES:
${JSON.stringify(ranked)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    const answer = String(parsed?.answer || '').trim() || 'I could not answer confidently from the selected sources.';
    const citations = normalizeCitations(parsed?.citations, ranked);
    return res.json({ answer, citations });
  } catch {
    const fallback = ranked.slice(0, 3).map((p) => ({
      source: p.source,
      excerpt: p.excerpt,
      page: p.page ?? null,
    }));
    return res.json({
      answer: 'AI is unavailable right now. Here are the most relevant excerpts from your selected PDFs.',
      citations: fallback,
    });
  }
});

app.post('/api/summary', async (req, res) => {
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!sources.length) return res.status(400).json({ error: 'Missing sources.' });
  const passages = buildPassagesFromSources(sources).slice(0, 30);
  const prompt = `
Create a concise academic summary from SOURCE_PASSAGES.
Return strict JSON:
{
  "title":"...",
  "keyPoints":["..."],
  "glossary":[{"term":"...","definition":"..."}],
  "openQuestions":["..."]
}
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json(normalizeSummary(parsed, passages));
  } catch {
    return res.json(buildSummaryFallback(passages));
  }
});

app.post('/api/study-guide', async (req, res) => {
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!sources.length) return res.status(400).json({ error: 'Missing sources.' });
  const passages = buildPassagesFromSources(sources).slice(0, 30);
  const prompt = `
Create a study guide from SOURCE_PASSAGES.
Return strict JSON:
{
  "sections":[
    {"title":"...","summary":"...","questions":[{"q":"...","a":"..."}]}
  ]
}
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json(normalizeStudyGuide(parsed, passages));
  } catch {
    return res.json(buildStudyGuideFallback(passages));
  }
});

app.post('/api/source-compare', async (req, res) => {
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (sources.length < 2) return res.status(400).json({ error: 'Select at least two sources.' });
  const compact = sources.map((s) => ({
    name: String(s?.name || 'source').trim(),
    excerpts: buildPassagesFromSources([s]).slice(0, 8).map((p) => p.excerpt),
  }));
  const prompt = `
Compare the following sources and return strict JSON:
{
  "agreements":["..."],
  "conflicts":["..."],
  "uniqueBySource":[{"source":"...","claims":["..."]}],
  "confidenceNotes":"..."
}
SOURCES:
${JSON.stringify(compact)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json(normalizeComparison(parsed, compact));
  } catch {
    return res.json(buildComparisonFallback(compact));
  }
});

app.post('/api/audio-overview', async (req, res) => {
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!sources.length) return res.status(400).json({ error: 'Missing sources.' });
  const passages = buildPassagesFromSources(sources).slice(0, 12);
  const prompt = `
Create a podcast-style academic briefing script from these notes.
Return strict JSON:
{
  "title":"...",
  "script":"..."
}
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json({
      title: String(parsed?.title || 'Audio Overview').trim(),
      script: String(parsed?.script || '').trim() || buildAudioScriptFallback(passages),
      audioUrl: '',
    });
  } catch {
    return res.json({
      title: 'Audio Overview',
      script: buildAudioScriptFallback(passages),
      audioUrl: '',
    });
  }
});

app.post('/api/quiz-generate', async (req, res) => {
  const mode = String(req.body?.mode || 'quiz').trim();
  const difficulty = String(req.body?.difficulty || 'medium').trim();
  const count = Math.max(3, Math.min(30, Number(req.body?.count || 10)));
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!sources.length) return res.status(400).json({ error: 'Missing sources.' });
  const passages = buildPassagesFromSources(sources).slice(0, 25);
  const prompt = `
Generate a ${mode} with exactly ${count} multiple-choice questions at ${difficulty} difficulty from SOURCE_PASSAGES.
Ground every question in the passages; distractors must be plausible but wrong.
Return strict JSON only:
{
  "topic":"short topic label",
  "total":${count},
  "estimatedCorrect":0,
  "sec":${Math.max(60, count * 45)},
  "questions":[
    {
      "prompt":"question text",
      "choices":["option A","option B","option C","option D"],
      "correctIndex":0
    }
  ]
}
Rules: each question has exactly 4 choices; correctIndex is 0-3.
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json(normalizeQuizResult(parsed, { mode, count, difficulty, passages }));
  } catch {
    return res.json(buildQuizFallback({ mode, count, difficulty, passages }));
  }
});

app.post('/api/tutor-chat', async (req, res) => {
  const promptText = String(req.body?.prompt || '').trim();
  const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
  if (!promptText) return res.status(400).json({ error: 'Missing prompt.' });
  const passages = buildPassagesFromSources(sources).slice(0, 10);
  const prompt = `
You are a university AI tutor.
Answer concisely with practical study guidance.
If sources are provided, ground answer in them.
Return strict JSON: {"reply":"..."}
QUESTION:
${promptText}
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json({ reply: String(parsed?.reply || '').trim() || 'Focus on weakest topics first and review using active recall.' });
  } catch {
    return res.json({ reply: 'Build 25-minute focused sessions, test yourself often, and revise weak topics first.' });
  }
});

app.post('/api/academics-advice', async (req, res) => {
  const grades = Array.isArray(req.body?.grades) ? req.body.grades : [];
  const target = Number(req.body?.target || 90);
  const finalWeight = Number(req.body?.finalWeight || 0.5);
  const avg = Number(req.body?.avg || 0);
  const prompt = `
You are an academic coach. Give concise recommendations.
Return strict JSON:
{"recommendations":["..."],"nextSteps":["..."]}
DATA:
${JSON.stringify({ grades, target, finalWeight, avg })}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [];
    const nextSteps = Array.isArray(parsed?.nextSteps) ? parsed.nextSteps.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [];
    return res.json({
      recommendations: recommendations.length ? recommendations : ['Review weakest subjects first and run timed practice.'],
      nextSteps: nextSteps.length ? nextSteps : ['Create a 7-day revision plan and track score changes.'],
    });
  } catch {
    return res.json({
      recommendations: ['Review weakest subjects first and run timed practice.'],
      nextSteps: ['Create a 7-day revision plan and track score changes.'],
    });
  }
});

app.post('/api/academics-estimate', async (req, res) => {
  const target = Number(req.body?.target || 90);
  const finalWeight = Number(req.body?.finalWeight || 0.5);
  const avg = Number(req.body?.avg || 0);
  const reqScore = finalWeight <= 0 ? 0 : Math.max(0, Math.min(100, (target - avg * (1 - finalWeight)) / finalWeight));
  const prompt = `
Explain this final-score estimate for a student.
Return strict JSON:
{"requiredFinal":0,"explanation":"..."}
DATA:
${JSON.stringify({ target, finalWeight, avg, reqScore })}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json({
      requiredFinal: Number(parsed?.requiredFinal ?? reqScore),
      explanation: String(parsed?.explanation || '').trim() || `You need about ${reqScore.toFixed(1)} on the final to reach your target.`,
    });
  } catch {
    return res.json({
      requiredFinal: reqScore,
      explanation: `You need about ${reqScore.toFixed(1)} on the final to reach your target.`,
    });
  }
});

async function generateCardsWithOllama(prompt) {
  const data = await callOllama(prompt);
  const raw = String(data.response || '').trim();
  const parsed = safeParseModelJson(raw);
  const cards = Array.isArray(parsed.cards)
    ? parsed.cards
        .filter((c) => c?.question && c?.answer)
        .slice(0, 12)
        .map((c, i) => ({
          id: `${Date.now()}-${i}`,
          question: String(c.question).trim(),
          answer: String(c.answer).trim(),
          evidence: String(c.evidence || '').trim(),
          right: 0,
          wrong: 0,
        }))
    : [];
  return normalizeCards(cards);
}

async function generatePresentationWithOllama(prompt) {
  const data = await callOllama(prompt);
  const raw = String(data.response || '').trim();
  const parsed = safeParseModelJson(raw);

  const title = String(parsed?.title || '').trim() || 'Generated Presentation';
  const references = Array.isArray(parsed?.references)
    ? parsed.references
        .map((r) => ({
          text: String(r?.text || '').trim(),
          url: String(r?.url || '').trim(),
        }))
        .filter((r) => r.text)
        .slice(0, 12)
    : [];
  const slides = Array.isArray(parsed?.slides)
    ? parsed.slides
        .filter((s) => s?.title && Array.isArray(s?.bullets) && s.bullets.length)
        .slice(0, 20)
        .map((s) => ({
          title: String(s.title).trim(),
          bullets: s.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 6),
          notes: String(s.notes || '').trim(),
          imageSuggestion: String(s.imageSuggestion || '').trim(),
          graphSuggestion: String(s.graphSuggestion || '').trim(),
        }))
    : [];
  const normalizedSlides = normalizeSlides(slides);
  const finalReferences = references.length ? references : buildScholarReferencesFromSlides(title, normalizedSlides);
  return { title, slides: normalizedSlides, references: finalReferences };
}

async function generateSectionsWithOllama(prompt) {
  const data = await callOllama(prompt);
  const raw = String(data.response || '').trim();
  const parsed = safeParseModelJson(raw);
  const apartados = Array.isArray(parsed?.apartados)
    ? parsed.apartados
        .filter((a) => a?.nombre)
        .slice(0, 12)
        .map((a, i) => ({
          id: String(a.id || `a${i + 1}`),
          nombre: String(a.nombre || '').trim(),
          descripcion: String(a.descripcion || '').trim(),
        }))
    : [];
  return normalizeApartados(apartados);
}

async function generateConceptMapWithOllama(prompt) {
  const data = await callOllama(prompt);
  const raw = String(data.response || '').trim();
  const parsed = safeParseModelJson(raw);
  return normalizeConceptMap({
    title: String(parsed?.title || 'Concept Map').trim(),
    nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
    links: Array.isArray(parsed?.links) ? parsed.links : [],
  });
}

async function callOllama(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: ollamaHeadersJson(),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Failed to query Ollama (${resp.status}).`);
    return await resp.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Ollama timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCards(cards) {
  const seen = new Set();
  return cards
    .map((c) => ({
      ...c,
      question: c.question.replace(/\s+/g, ' ').trim(),
      answer: c.answer.replace(/\s+/g, ' ').trim(),
    }))
    .filter((c) => c.question.length >= 10 && c.answer.length >= 15)
    .filter((c) => {
      const k = c.question.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function normalizeSlides(slides) {
  const seenTitle = new Set();
  return slides.filter((s) => {
    const k = s.title.toLowerCase();
    if (seenTitle.has(k)) return false;
    seenTitle.add(k);
    return s.bullets.length >= 2;
  });
}

function normalizeApartados(apartados) {
  const seenName = new Set();
  return apartados.filter((a) => {
    const k = a.nombre.toLowerCase();
    if (seenName.has(k)) return false;
    seenName.add(k);
    return a.nombre.length >= 3;
  });
}

function buildLocalApartadosFallback(sourceJson) {
  const base = [...(sourceJson?.topics || []), ...(sourceJson?.facts || [])]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const items = base.length ? base : ['Introduction', 'Core Concepts', 'Applications', 'Summary'];
  return items.slice(0, 8).map((name, i) => ({
    id: `a${i + 1}`,
    nombre: name.split(/\s+/).slice(0, 6).join(' '),
    descripcion: sourceJson?.facts?.[i] || '',
  }));
}

function assignConceptLevels(nodes, links) {
  if (!nodes.length) return;
  const idSet = new Set(nodes.map((n) => n.id));
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  for (const l of links) {
    if (idSet.has(l.source) && idSet.has(l.target)) {
      adj.get(l.source).push(l.target);
      adj.get(l.target).push(l.source);
    }
  }
  const root =
    nodes.find((n) => Number(n.level) === 0)?.id ||
    nodes.find((n) => /main|central|topic|root/i.test(n.label))?.id ||
    nodes[0].id;
  const lev = {};
  const q = [root];
  lev[root] = 0;
  const seen = new Set([root]);
  while (q.length) {
    const u = q.shift();
    for (const v of adj.get(u) || []) {
      if (!seen.has(v)) {
        seen.add(v);
        lev[v] = Math.min(3, lev[u] + 1);
        q.push(v);
      }
    }
  }
  for (const n of nodes) {
    const inferred = lev[n.id] !== undefined ? lev[n.id] : 2;
    const fromModel = n.level;
    n.level = Number.isFinite(fromModel) && fromModel >= 0 ? Math.min(3, Math.max(0, fromModel)) : Math.min(3, inferred);
  }
}

function normalizeConceptMap(map) {
  const seenNode = new Set();
  const nodes = (map.nodes || [])
    .map((n, i) => ({
      id: String(n?.id || `n${i + 1}`),
      label: String(n?.label || '').trim(),
      description: String(n?.description || '').trim(),
      level: n?.level !== undefined && n?.level !== null ? Number(n.level) : NaN,
    }))
    .filter((n) => n.label && n.label.length >= 2)
    .filter((n) => {
      const key = n.label.toLowerCase();
      if (seenNode.has(key)) return false;
      seenNode.add(key);
      return true;
    })
    .slice(0, 22);

  const validIds = new Set(nodes.map((n) => n.id));
  const links = (map.links || [])
    .map((l) => ({
      source: String(l?.source || '').trim(),
      target: String(l?.target || '').trim(),
      label: String(l?.label || '').trim(),
    }))
    .filter((l) => l.source && l.target && l.source !== l.target)
    .filter((l) => validIds.has(l.source) && validIds.has(l.target))
    .slice(0, 40);

  assignConceptLevels(nodes, links);

  return { title: map.title || 'Concept Map', nodes, links };
}

function buildLocalConceptMapFallback(title, sourceJson) {
  const labels = [...(sourceJson.topics || [])].slice(0, 12);
  const core = labels.length ? labels : ['Introduction', 'Core Concepts', 'Methods', 'Applications', 'Summary'];
  const nodes = [
    {
      id: 'n0',
      label: String(title || 'Main Topic').slice(0, 40),
      description: 'Main concept from uploaded document.',
      level: 0,
    },
  ];
  core.forEach((label, i) => {
    const lv = i < 4 ? 1 : 2;
    nodes.push({
      id: `n${i + 1}`,
      label: String(label).split(/\s+/).slice(0, 5).join(' '),
      description: String(sourceJson.facts?.[i] || '').slice(0, 200),
      level: lv,
    });
  });
  const links = nodes.slice(1, 5).map((n) => ({ source: 'n0', target: n.id, label: 'includes' }));
  for (let i = 5; i < nodes.length; i += 1) {
    links.push({ source: nodes[1 + ((i - 5) % 4)].id, target: nodes[i].id, label: 'extends' });
  }
  for (let i = 2; i < Math.min(nodes.length, 8); i += 1) {
    links.push({ source: nodes[i - 1].id, target: nodes[i].id, label: 'related' });
  }
  return { title: title || 'Concept Map', nodes, links };
}

function buildPassagesFromSources(sources) {
  const passages = [];
  for (const source of sources) {
    const name = String(source?.name || 'source').trim();
    const content = String(source?.content || '').trim().slice(0, 20000);
    const sourceJson = buildSourceJson(content);
    for (const s of sourceJson.sentences.slice(0, 20)) {
      passages.push({ source: name, excerpt: s, page: null });
    }
  }
  return passages;
}

function rankPassages(query, passages) {
  const queryWords = new Set(
    String(query || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4),
  );
  return passages
    .map((p) => {
      const words = new Set(
        p.excerpt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4),
      );
      let overlap = 0;
      for (const w of queryWords) if (words.has(w)) overlap += 1;
      return { ...p, score: overlap };
    })
    .sort((a, b) => b.score - a.score);
}

function normalizeCitations(rawCitations, rankedPassages) {
  const fallback = rankedPassages.slice(0, 3).map((p) => ({ source: p.source, excerpt: p.excerpt, page: p.page ?? null }));
  if (!Array.isArray(rawCitations)) return fallback;
  const rows = rawCitations
    .map((c) => ({
      source: String(c?.source || '').trim(),
      excerpt: String(c?.excerpt || '').trim(),
      page: c?.page ?? null,
    }))
    .filter((c) => c.source && c.excerpt)
    .slice(0, 8);
  return rows.length ? rows : fallback;
}

function normalizeSummary(parsed, passages) {
  const keyPoints = Array.isArray(parsed?.keyPoints) ? parsed.keyPoints.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [];
  const glossary = Array.isArray(parsed?.glossary)
    ? parsed.glossary
        .map((g) => ({ term: String(g?.term || '').trim(), definition: String(g?.definition || '').trim() }))
        .filter((g) => g.term && g.definition)
        .slice(0, 8)
    : [];
  const openQuestions = Array.isArray(parsed?.openQuestions) ? parsed.openQuestions.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [];
  if (!keyPoints.length) return buildSummaryFallback(passages);
  return { title: String(parsed?.title || 'Document Summary').trim(), keyPoints, glossary, openQuestions };
}

function buildSummaryFallback(passages) {
  const base = passages.slice(0, 6).map((p) => p.excerpt);
  return {
    title: 'Document Summary',
    keyPoints: base.length ? base : ['No key points extracted.'],
    glossary: [],
    openQuestions: ['Which concepts need deeper clarification?'],
  };
}

function normalizeStudyGuide(parsed, passages) {
  const sections = Array.isArray(parsed?.sections)
    ? parsed.sections
        .map((s) => ({
          title: String(s?.title || '').trim(),
          summary: String(s?.summary || '').trim(),
          questions: Array.isArray(s?.questions)
            ? s.questions
                .map((q) => ({ q: String(q?.q || '').trim(), a: String(q?.a || '').trim() }))
                .filter((q) => q.q && q.a)
                .slice(0, 6)
            : [],
        }))
        .filter((s) => s.title && s.summary)
        .slice(0, 8)
    : [];
  if (!sections.length) return buildStudyGuideFallback(passages);
  return { sections };
}

function buildStudyGuideFallback(passages) {
  const top = passages.slice(0, 4);
  return {
    sections: top.map((p, i) => ({
      title: `Section ${i + 1}`,
      summary: p.excerpt,
      questions: [{ q: `What is the key idea in section ${i + 1}?`, a: p.excerpt }],
    })),
  };
}

function normalizeComparison(parsed, compactSources) {
  const agreements = Array.isArray(parsed?.agreements) ? parsed.agreements.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [];
  const conflicts = Array.isArray(parsed?.conflicts) ? parsed.conflicts.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [];
  const uniqueBySource = Array.isArray(parsed?.uniqueBySource)
    ? parsed.uniqueBySource
        .map((u) => ({
          source: String(u?.source || '').trim(),
          claims: Array.isArray(u?.claims) ? u.claims.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [],
        }))
        .filter((u) => u.source)
        .slice(0, compactSources.length)
    : [];
  const confidenceNotes = String(parsed?.confidenceNotes || '').trim() || 'Local comparison generated from available excerpts.';
  if (!agreements.length && !conflicts.length && !uniqueBySource.length) return buildComparisonFallback(compactSources);
  return { agreements, conflicts, uniqueBySource, confidenceNotes };
}

function buildComparisonFallback(compactSources) {
  return {
    agreements: ['Sources share overlapping concepts in the uploaded material.'],
    conflicts: [],
    uniqueBySource: compactSources.map((s) => ({
      source: s.name,
      claims: s.excerpts.slice(0, 2),
    })),
    confidenceNotes: 'Fallback comparison used due to AI unavailability.',
  };
}

function buildAudioScriptFallback(passages) {
  const bullets = passages.slice(0, 6).map((p) => `- ${p.excerpt}`).join('\n');
  return `Welcome to your study audio overview.\n\nToday we cover the key points from your selected documents:\n${bullets}\n\nEnd of overview.`;
}

function normalizeQuizQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x, i) => {
      const prompt = String(x?.prompt || x?.question || '').trim();
      const choices = Array.isArray(x?.choices)
        ? x.choices.map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
        : [];
      let correctIndex = Number(x?.correctIndex);
      if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) correctIndex = 0;
      return { id: String(x?.id || `q-${i}`), prompt, choices, correctIndex };
    })
    .filter((q) => q.prompt && q.choices.length >= 2);
}

function buildQuizQuestionsFromPassages(passages, count) {
  const list = Array.isArray(passages) && passages.length ? passages : [{ source: 'material', excerpt: 'Review your uploaded source carefully.' }];
  const n = Math.max(3, Math.min(30, count));
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = list[i % list.length];
    const excerpt = String(base?.excerpt || 'Review the passage.').slice(0, 260);
    const short = excerpt.slice(0, 110);
    out.push({
      id: `fb-${i}`,
      prompt: `According to "${String(base?.source || 'source')}", which option best matches this idea? "${short}${excerpt.length > 110 ? '…' : ''}"`,
      choices: [
        short,
        'The passage does not support this interpretation.',
        'This confuses two different concepts from the text.',
        'This introduces an unrelated example.',
      ],
      correctIndex: 0,
    });
  }
  return out;
}

function normalizeQuizResult(parsed, { mode, count, difficulty, passages }) {
  const normalized = normalizeQuizQuestions(parsed?.questions);
  const questions =
    normalized.length >= Math.min(3, count) ? normalized.slice(0, count) : buildQuizQuestionsFromPassages(passages || [], count);
  const total = questions.length;
  const est = Number(parsed?.estimatedCorrect);
  const correctEst = Number.isFinite(est)
    ? Math.max(0, Math.min(total, est))
    : Math.min(total, Math.round(total * 0.72));
  return {
    id: Date.now(),
    topic: String(parsed?.topic || mode.toUpperCase()).trim(),
    total,
    correct: correctEst,
    sec: Math.max(30, Number(parsed?.sec || Math.max(120, total * 45))),
    difficulty,
    questions,
  };
}

function buildQuizFallback({ mode, count, difficulty, passages }) {
  const questions = buildQuizQuestionsFromPassages(passages || [], count);
  const total = questions.length;
  return {
    id: Date.now(),
    topic: `${mode.toUpperCase()} (backup)`,
    total,
    correct: Math.round(total * 0.7),
    sec: 120,
    difficulty,
    questions,
  };
}

function buildScholarReferencesFromSlides(title, slides) {
  const words = `${title} ${slides.map((s) => `${s.title} ${s.bullets.join(' ')}`).join(' ')}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const freq = new Map();
  for (const w of new Set(words)) freq.set(w, (freq.get(w) || 0) + 1);
  const queries = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => `${title} ${w}`);
  return queries.map((q, i) => ({
    text: `Google Scholar search ${i + 1}: ${q}`,
    url: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`,
  }));
}

function buildSourceJson(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 18000);
  const sentences = (cleaned.match(/[^.!?]+[.!?]/g) || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 260)
    .slice(0, 60);

  const stop = new Set([
    'about','after','again','being','between','could','every','first','from','have','into','other','since',
    'their','there','these','those','through','until','using','which','while','would','where','with','this',
  ]);
  const freq = new Map();
  for (const s of sentences) {
    const uniq = new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5 && !stop.has(w)),
    );
    for (const w of uniq) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topics = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  const facts = sentences.slice(0, 20);

  return {
    topics,
    facts,
    sentences: sentences.slice(0, 30),
  };
}

function safeParseModelJson(raw) {
  // Accept plain JSON, fenced markdown JSON, or extra pre/post text around JSON.
  const cleanedFence = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleanedFence);
  } catch {
    const first = cleanedFence.indexOf('{');
    const last = cleanedFence.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const sliced = cleanedFence.slice(first, last + 1);
      return JSON.parse(sliced);
    }
    throw new Error('Model output was not valid JSON.');
  }
}

function safeParseStoredJson(raw) {
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
let mailTransporter = null;

function getMailTransporter() {
  if (!SMTP_CONFIGURED) return null;
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return mailTransporter;
}

async function sendTaskReminderEmail(to, { title, kind, dueAt, whenLabel }) {
  const tx = getMailTransporter();
  if (!tx || !to) return false;
  const kindLabel = kind === 'event' ? 'Event' : 'Task';
  const when = new Date(dueAt).toLocaleString();
  await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[Student Assistant] ${whenLabel} until due: ${title}`,
    text: `${kindLabel} "${title}" is scheduled for ${when}.\n\nThis is your ${whenLabel} reminder before the due time.`,
  });
  return true;
}

async function processTaskEmailReminders() {
  if (!supabase) return;
  const { data: rows, error } = await supabase
    .from('tasks')
    .select('id,owner_id,title,due_at,done,reminder_1h_sent,reminder_10m_sent,kind')
    .eq('done', false)
    .not('due_at', 'is', null);
  if (error) {
    if (!String(error.message || '').includes('column')) {
      console.warn('[task-email]', error.message);
    }
    return;
  }
  const now = Date.now();
  for (const row of rows || []) {
    const due = new Date(row.due_at).getTime();
    if (Number.isNaN(due) || due <= now) continue;

    const rem1 = due - 60 * 60 * 1000;
    const rem10 = due - 10 * 60 * 1000;

    let email = null;
    try {
      const { data: adminData, error: adminErr } = await supabase.auth.admin.getUserById(row.owner_id);
      if (adminErr) continue;
      email = adminData?.user?.email || null;
    } catch {
      continue;
    }
    if (!email) continue;

    if (!row.reminder_1h_sent && now >= rem1 && now < due) {
      try {
        const ok = await sendTaskReminderEmail(email, {
          title: row.title,
          kind: row.kind,
          dueAt: row.due_at,
          whenLabel: '1 hour',
        });
        if (ok) await supabase.from('tasks').update({ reminder_1h_sent: true }).eq('id', row.id);
      } catch (e) {
        console.warn('[task-email] 1h send failed', e?.message || e);
      }
    }
    if (!row.reminder_10m_sent && now >= rem10 && now < due) {
      try {
        const ok = await sendTaskReminderEmail(email, {
          title: row.title,
          kind: row.kind,
          dueAt: row.due_at,
          whenLabel: '10 minutes',
        });
        if (ok) await supabase.from('tasks').update({ reminder_10m_sent: true }).eq('id', row.id);
      } catch (e) {
        console.warn('[task-email] 10m send failed', e?.message || e);
      }
    }
  }
}

setInterval(() => {
  processTaskEmailReminders().catch(() => {});
}, 60_000);

/** Production: serve Vite build from dist/ so one process hosts API + SPA (e.g. Render free tier). */
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  const { supabaseUrl: _pubUrl, supabaseAnonKey: _pubKey } = browserSupabasePublicEnv();
  if (!_pubUrl || !_pubKey) {
    console.warn(
      '[Supabase] Browser needs SUPABASE_URL (or VITE_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY on this service.',
    );
  }
  // index: false so GET / does not bypass SPA handler — we must inject window.__SA_ENV__ into index.html.
  app.use(express.static(distDir, { index: false }));
  console.log(`[static] Serving SPA from ${distDir}`);
  const indexPath = path.join(distDir, 'index.html');
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    fs.readFile(indexPath, 'utf8', (err, html) => {
      if (err) return next(err);
      const { supabaseUrl, supabaseAnonKey } = browserSupabasePublicEnv();
      const script = `<script>window.__SA_ENV__=${JSON.stringify({ supabaseUrl, supabaseAnonKey })};</script>`;
      const out = html.includes('<!--SA_ENV_INJECT-->')
        ? html.replace('<!--SA_ENV_INJECT-->', script)
        : html.replace('</head>', `${script}</head>`);
      res.type('html');
      res.send(out);
    });
  });
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(
    `[Ollama] OLLAMA_URL=${OLLAMA_URL} model=${OLLAMA_MODEL}${OLLAMA_API_KEY ? ' (API key set)' : ''}`,
  );
  if (VERCEL_API_KEY) console.log('[vercel] VERCEL_API_KEY is set (server-side token).');
  if (SMTP_CONFIGURED) console.log('[task-email] SMTP reminders enabled (checks every 60s).');
  else console.log('[task-email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS for email reminders.');
  processTaskEmailReminders().catch(() => {});
});
