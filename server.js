import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

app.use(cors());
app.use(express.json({ limit: '4mb' }));

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

app.get('/api/health', async (_req, res) => {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!resp.ok) throw new Error('Ollama unavailable');
    return res.json({ ok: true, model: OLLAMA_MODEL });
  } catch {
    return res.status(503).json({ ok: false, error: 'Ollama is not running.' });
  }
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
    const [{ data: sources, error: srcErr }, { data: maps, error: mapsErr }, { data: notebook, error: notebookErr }] = await Promise.all([
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
    ]);
    if (srcErr || mapsErr || notebookErr) throw (srcErr || mapsErr || notebookErr);
    return res.json({
      pdfs: (sources || []).map((s) => {
        const sc = s.source_contents;
        const text = Array.isArray(sc) ? sc[0]?.cleaned_text : sc?.cleaned_text;
        return {
          id: s.id,
          name: s.title,
          content: text || '',
          createdAt: s.created_at,
        };
      }),
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

    const hasLegacyStudentPdfs = await tryTableExists('student_pdfs');
    if (hasLegacyStudentPdfs) {
      await supabase.from('student_pdfs').insert({ student_id: studentId, name, content });
    }
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
      const { count, error } = await supabase
        .from('assignment_submissions')
        .select('*', { count: 'exact', head: true })
        .in('assignment_id', (
          (await supabase.from('teacher_assignments').select('id').in('class_id', classIds)).data || []
        ).map((a) => a.id));
      if (error) throw error;
      submissionCount = count || 0;
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
    return res.status(500).json(formatSupabaseError(error, 'Could not create class.'));
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
    const [{ count: enrolled, error: enrErr }, { data: gradeRows, error: gradeErr }, { count: assignmentCount, error: assErr }] = await Promise.all([
      supabase.from('class_enrollments').select('*', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'active'),
      supabase.from('teacher_grades').select('student_id,score').eq('class_id', classId),
      supabase.from('teacher_assignments').select('*', { count: 'exact', head: true }).eq('class_id', classId),
    ]);
    if (enrErr || gradeErr || assErr) throw (enrErr || gradeErr || assErr);
    const avgScore = (gradeRows && gradeRows.length)
      ? gradeRows.reduce((sum, r) => sum + Number(r.score || 0), 0) / gradeRows.length
      : 0;
    return res.json({
      progress: {
        enrolled: enrolled || 0,
        assignments: assignmentCount || 0,
        gradedEntries: gradeRows?.length || 0,
        averageScore: Number(avgScore.toFixed(2)),
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
    const quizPrompt = `
Generate a quiz with ${count} questions at ${difficulty} difficulty from SOURCE_PASSAGES.
Return strict JSON:
{
  "topic":"${title}",
  "total":${count},
  "estimatedCorrect":0,
  "sec":120
}
SOURCE_PASSAGES:
${JSON.stringify(buildPassagesFromSources([{ name: title, content: `${promptText}\n\n${mergedText}` }]).slice(0, 25))}
`;
    let result;
    try {
      const modelData = await callOllama(quizPrompt);
      const parsed = safeParseModelJson(String(modelData.response || '').trim());
      result = normalizeQuizResult(parsed, { mode: 'quiz', count, difficulty });
    } catch {
      result = buildQuizFallback({ mode: 'quiz', count, difficulty });
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
Create a concept map from university study material.

Rules:
- Return 5 to 14 nodes.
- Keep labels concise (max 5 words).
- Include a central node and meaningful links.
- Return strict JSON only:
{
  "title":"...",
  "nodes":[
    {"id":"n1","label":"...","description":"..."}
  ],
  "links":[
    {"source":"n1","target":"n2","label":"..."}
  ]
}

SOURCE_JSON:
${JSON.stringify(sourceJson)}
`;

  try {
    let conceptMap = await generateConceptMapWithOllama(prompt);
    if (conceptMap.nodes.length < 4 || conceptMap.links.length < 3) {
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
Generate a ${mode} with ${count} questions at ${difficulty} difficulty from SOURCE_PASSAGES.
Return strict JSON:
{
  "topic":"...",
  "total":${count},
  "estimatedCorrect":0,
  "sec":120
}
SOURCE_PASSAGES:
${JSON.stringify(passages)}
`;
  try {
    const data = await callOllama(prompt);
    const parsed = safeParseModelJson(String(data.response || '').trim());
    return res.json(normalizeQuizResult(parsed, { mode, count, difficulty }));
  } catch {
    return res.json(buildQuizFallback({ mode, count, difficulty }));
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
      headers: { 'Content-Type': 'application/json' },
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

function normalizeConceptMap(map) {
  const seenNode = new Set();
  const nodes = (map.nodes || [])
    .map((n, i) => ({
      id: String(n?.id || `n${i + 1}`),
      label: String(n?.label || '').trim(),
      description: String(n?.description || '').trim(),
    }))
    .filter((n) => n.label && n.label.length >= 2)
    .filter((n) => {
      const key = n.label.toLowerCase();
      if (seenNode.has(key)) return false;
      seenNode.add(key);
      return true;
    })
    .slice(0, 14);

  const validIds = new Set(nodes.map((n) => n.id));
  const links = (map.links || [])
    .map((l) => ({
      source: String(l?.source || '').trim(),
      target: String(l?.target || '').trim(),
      label: String(l?.label || '').trim(),
    }))
    .filter((l) => l.source && l.target && l.source !== l.target)
    .filter((l) => validIds.has(l.source) && validIds.has(l.target))
    .slice(0, 28);

  return { title: map.title || 'Concept Map', nodes, links };
}

function buildLocalConceptMapFallback(title, sourceJson) {
  const labels = [...(sourceJson.topics || [])].slice(0, 10);
  const core = labels.length ? labels : ['Introduction', 'Core Concepts', 'Methods', 'Applications', 'Summary'];
  const nodes = [{ id: 'n0', label: title || 'Main Topic', description: 'Main concept from uploaded document.' }];
  core.forEach((label, i) => {
    nodes.push({
      id: `n${i + 1}`,
      label: String(label).split(/\s+/).slice(0, 4).join(' '),
      description: sourceJson.facts?.[i] || '',
    });
  });
  const links = nodes.slice(1).map((n) => ({ source: 'n0', target: n.id, label: 'relates to' }));
  for (let i = 2; i < nodes.length; i += 1) {
    links.push({ source: nodes[i - 1].id, target: nodes[i].id, label: 'builds on' });
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

function normalizeQuizResult(parsed, { mode, count, difficulty }) {
  return {
    id: Date.now(),
    topic: String(parsed?.topic || mode.toUpperCase()).trim(),
    total: Math.max(1, Number(parsed?.total || count)),
    correct: Math.max(0, Math.min(Number(parsed?.total || count), Number(parsed?.estimatedCorrect || Math.round(count * 0.7)))),
    sec: Math.max(30, Number(parsed?.sec || 120)),
    difficulty,
  };
}

function buildQuizFallback({ mode, count, difficulty }) {
  return {
    id: Date.now(),
    topic: mode.toUpperCase(),
    total: count,
    correct: Math.round(count * 0.7),
    sec: 120,
    difficulty,
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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  if (SMTP_CONFIGURED) console.log('[task-email] SMTP reminders enabled (checks every 60s).');
  else console.log('[task-email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS for email reminders.');
  processTaskEmailReminders().catch(() => {});
});
