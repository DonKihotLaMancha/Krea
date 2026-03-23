import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!resp.ok) throw new Error('Ollama unavailable');
    return res.json({ ok: true, model: OLLAMA_MODEL });
  } catch {
    return res.status(503).json({ ok: false, error: 'Ollama is not running.' });
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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
